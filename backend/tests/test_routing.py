"""Tests for the routing matrix (road distance/time to fuel stations).

The value of this endpoint is that a station 3 km away as the crow flies can be
45 km by road when a mountain sits in between — so the tests use coordinates
whose road answers deliberately disagree with straight-line distance, and
assert that each answer lands on the right station.
"""

import httpx
import pytest

from app.services import routing_service
from app.services.routing_service import RoutingService, clear_cache

# Grenoble and two points around it. The "mountain" one is closer as the crow
# flies than the "valley" one, but much further by road.
ORIGIN = {"latitude": 45.1885, "longitude": 5.7245}
VALLEY = {"latitude": 45.2000, "longitude": 5.9000}
MOUNTAIN = {"latitude": 45.1000, "longitude": 5.5000}


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("boom", request=None, response=None)

    def json(self):
        return self._payload


def osrm_payload(*legs):
    """legs: (distance_m, duration_s) per destination, None for unroutable."""
    distances = [0.0] + [None if leg is None else leg[0] for leg in legs]
    durations = [0.0] + [None if leg is None else leg[1] for leg in legs]
    return {"code": "Ok", "distances": [distances], "durations": [durations]}


@pytest.fixture(autouse=True)
def _clean_cache():
    clear_cache()
    yield
    clear_cache()


@pytest.fixture()
def spy(monkeypatch):
    """Replace the provider call; records every request made.

    Accepts a payload dict, an exception to raise, or a callable receiving
    (url, json_body) and returning a payload — the callable form lets a test
    answer each batch according to what that batch actually asked for, which
    survives the concurrent batching.

    Re-arming the spy starts a fresh recording window, so a test can assert on
    the calls made *after* a setup step.
    """

    calls = []

    def make(payload_or_exc):
        calls.clear()

        def respond(url, json_body=None):
            calls.append(url)
            if isinstance(payload_or_exc, Exception):
                raise payload_or_exc
            if callable(payload_or_exc):
                return FakeResponse(payload_or_exc(url, json_body))
            return FakeResponse(payload_or_exc)

        monkeypatch.setattr(
            routing_service.httpx, "get", lambda url, params=None, timeout=None: respond(url)
        )
        monkeypatch.setattr(
            routing_service.httpx,
            "post",
            lambda url, json=None, timeout=None: respond(url, json),
        )
        return calls

    return make


def coords_from_osrm_url(url):
    """The lon,lat;lon,lat... segment of an OSRM table URL."""
    points = url.rsplit("/", 1)[-1]
    return [tuple(float(v) for v in pair.split(",")) for pair in points.split(";")]


class TestMatrixMapping:
    def test_legs_follow_destination_order(self, client, spy):
        """The valley answer must not be attributed to the mountain station."""
        spy(osrm_payload((25154.9, 2932.8), (44893.4, 3781.3)))

        resp = client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": [VALLEY, MOUNTAIN]},
        )

        assert resp.status_code == 200
        legs = resp.json()["legs"]
        assert legs[0]["distance_m"] == pytest.approx(25154.9)
        assert legs[0]["duration_s"] == pytest.approx(2932.8)
        assert legs[1]["distance_m"] == pytest.approx(44893.4)
        assert legs[1]["duration_s"] == pytest.approx(3781.3)

    def test_origin_column_is_skipped(self, client, spy):
        """Column 0 of the OSRM row is origin->origin and must never be a leg."""
        spy(osrm_payload((1234.0, 300.0)))

        resp = client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": [VALLEY]},
        )

        legs = resp.json()["legs"]
        assert len(legs) == 1
        assert legs[0]["distance_m"] == pytest.approx(1234.0)

    def test_unroutable_destination_returns_nulls(self, client, spy):
        spy(osrm_payload((25154.9, 2932.8), None))

        legs = client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": [VALLEY, MOUNTAIN]},
        ).json()["legs"]

        assert legs[0]["distance_m"] == pytest.approx(25154.9)
        assert legs[1] == {"distance_m": None, "duration_s": None}


class TestCaching:
    def test_second_identical_call_skips_provider(self, client, spy):
        calls = spy(osrm_payload((25154.9, 2932.8)))
        body = {"origin": ORIGIN, "destinations": [VALLEY]}

        first = client.post("/api/v1/routing/matrix", json=body).json()
        second = client.post("/api/v1/routing/matrix", json=body).json()

        assert first["cached"] is False
        assert second["cached"] is True
        assert len(calls) == 1
        assert second["legs"] == first["legs"]

    def test_only_new_stations_are_queried(self, client, spy):
        """Adding a station to the search must not re-query the known one, and
        the single fetched answer must land in the new station's slot."""
        calls = spy(osrm_payload((25154.9, 2932.8)))
        client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": [VALLEY]},
        )

        calls = spy(osrm_payload((44893.4, 3781.3)))
        legs = client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": [VALLEY, MOUNTAIN]},
        ).json()["legs"]

        # Only the mountain was asked about
        assert len(calls) == 1
        assert "5.5,45.1" in calls[0]
        assert "5.9,45.2" not in calls[0]
        # Cached leg stayed in slot 0, fetched leg went to slot 1
        assert legs[0]["distance_m"] == pytest.approx(25154.9)
        assert legs[1]["distance_m"] == pytest.approx(44893.4)

    def test_nearly_identical_gps_reading_hits_cache(self, client, spy):
        """A few metres of GPS drift must not trigger a new provider call."""
        calls = spy(osrm_payload((25154.9, 2932.8)))
        client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": [VALLEY]},
        )

        drifted = {"latitude": ORIGIN["latitude"] + 0.000004, "longitude": ORIGIN["longitude"]}
        resp = client.post(
            "/api/v1/routing/matrix",
            json={"origin": drifted, "destinations": [VALLEY]},
        ).json()

        assert resp["cached"] is True
        assert len(calls) == 1


class TestProviderFailure:
    def test_outage_returns_nulls_not_error(self, client, spy):
        """The station list must stay usable when routing is down."""
        spy(httpx.ConnectError("provider down"))

        resp = client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": [VALLEY, MOUNTAIN]},
        )

        assert resp.status_code == 200
        assert resp.json()["legs"] == [
            {"distance_m": None, "duration_s": None},
            {"distance_m": None, "duration_s": None},
        ]

    def test_failures_are_not_cached(self, client, spy):
        """A blip must not blank out distances for the whole 6 h TTL."""
        spy(httpx.ConnectError("provider down"))
        client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": [VALLEY]},
        )

        calls = spy(osrm_payload((25154.9, 2932.8)))
        legs = client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": [VALLEY]},
        ).json()["legs"]

        assert len(calls) == 1, "recovered provider should be retried, not served from cache"
        assert legs[0]["distance_m"] == pytest.approx(25154.9)

    def test_error_code_from_provider(self, client, spy):
        spy({"code": "NoTable"})
        legs = client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": [VALLEY]},
        ).json()["legs"]

        assert legs == [{"distance_m": None, "duration_s": None}]


class TestBatching:
    """A 50 km search can hold a few hundred stations — well past any provider's
    table limit — so requests are split. Batches run concurrently, so the only
    thing keeping legs aligned is the reassembly order."""

    # Destination i sits at longitude 5.000 + i/1000, and the fake provider
    # answers with that i. Any batch shuffled or misaligned shows up instantly.
    @staticmethod
    def _destinations(count):
        return [{"latitude": 45.0, "longitude": 5.0 + i / 1000} for i in range(count)]

    @staticmethod
    def _answer_by_longitude(url, _json):
        coords = coords_from_osrm_url(url)
        # coords[0] is the origin; the rest are this batch's destinations.
        indices = [round((lon - 5.0) * 1000) for lon, _lat in coords[1:]]
        return osrm_payload(*[(float(i), float(i) * 2) for i in indices])

    def test_large_search_is_split_into_batches(self, client, spy, monkeypatch):
        monkeypatch.setattr(routing_service.settings, "ROUTING_MAX_BATCH", 95)
        calls = spy(self._answer_by_longitude)

        resp = client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": self._destinations(200)},
        )

        assert resp.status_code == 200
        assert len(calls) == 3, "200 destinations at 95 per batch = 3 requests"

    def test_legs_stay_aligned_across_batch_boundaries(self, client, spy, monkeypatch):
        monkeypatch.setattr(routing_service.settings, "ROUTING_MAX_BATCH", 95)
        spy(self._answer_by_longitude)

        legs = client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": self._destinations(200)},
        ).json()["legs"]

        assert len(legs) == 200
        # Every leg must carry its own destination's answer, including the ones
        # straddling the 95/190 boundaries.
        for i, leg in enumerate(legs):
            assert leg["distance_m"] == pytest.approx(float(i)), f"leg {i} misaligned"
            assert leg["duration_s"] == pytest.approx(float(i) * 2)

    def test_one_failing_batch_does_not_void_the_others(self, client, spy, monkeypatch):
        """A blip on batch 2 must leave batches 1 and 3 usable."""
        monkeypatch.setattr(routing_service.settings, "ROUTING_MAX_BATCH", 95)

        def flaky(url, json_body):
            coords = coords_from_osrm_url(url)
            first = round((coords[1][0] - 5.0) * 1000)
            if first == 95:  # the middle batch
                raise httpx.ConnectError("blip")
            return TestBatching._answer_by_longitude(url, json_body)

        spy(flaky)

        legs = client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": self._destinations(200)},
        ).json()["legs"]

        assert legs[0]["distance_m"] == pytest.approx(0.0)
        assert legs[94]["distance_m"] == pytest.approx(94.0)
        assert legs[95] == {"distance_m": None, "duration_s": None}
        assert legs[189] == {"distance_m": None, "duration_s": None}
        assert legs[190]["distance_m"] == pytest.approx(190.0)


class TestValhallaProvider:
    @pytest.fixture(autouse=True)
    def _use_valhalla(self, monkeypatch):
        monkeypatch.setattr(routing_service.settings, "ROUTING_PROVIDER", "valhalla")
        monkeypatch.setattr(routing_service.settings, "ROUTING_URL", "http://valhalla:8002")

    @staticmethod
    def valhalla_payload(*cells):
        """cells: (distance_km, time_s) per target, None for unreachable."""
        row = [
            {"distance": None, "time": None} if c is None else {"distance": c[0], "time": c[1]}
            for c in cells
        ]
        return {"sources_to_targets": [row]}

    def test_kilometres_are_converted_to_metres(self, client, spy):
        """Valhalla answers in km, the API contract is metres — the conversion
        is the whole difference between 25 km and 25 m."""
        spy(self.valhalla_payload((25.1549, 2932.8)))

        legs = client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": [VALLEY]},
        ).json()["legs"]

        assert legs[0]["distance_m"] == pytest.approx(25154.9)
        assert legs[0]["duration_s"] == pytest.approx(2932.8)

    def test_targets_keep_their_order(self, client, spy):
        spy(self.valhalla_payload((25.1549, 2932.8), (44.8934, 3781.3)))

        legs = client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": [VALLEY, MOUNTAIN]},
        ).json()["legs"]

        assert legs[0]["distance_m"] == pytest.approx(25154.9)
        assert legs[1]["distance_m"] == pytest.approx(44893.4)

    def test_no_origin_column_is_skipped(self, client, spy):
        """Unlike OSRM, Valhalla returns one cell per target and no self-column.
        Skipping a column here would drop the first station."""
        spy(self.valhalla_payload((1.234, 300.0)))

        legs = client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": [VALLEY]},
        ).json()["legs"]

        assert len(legs) == 1
        assert legs[0]["distance_m"] == pytest.approx(1234.0)

    def test_unreachable_target(self, client, spy):
        spy(self.valhalla_payload((25.1549, 2932.8), None))

        legs = client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": [VALLEY, MOUNTAIN]},
        ).json()["legs"]

        assert legs[1] == {"distance_m": None, "duration_s": None}

    def test_request_targets_the_valhalla_endpoint(self, client, spy):
        calls = spy(self.valhalla_payload((1.0, 60.0)))

        client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": [VALLEY]},
        )

        assert calls == ["http://valhalla:8002/sources_to_targets"]

    def test_outage_falls_back_like_osrm(self, client, spy):
        spy(httpx.ConnectError("valhalla down"))

        resp = client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": [VALLEY]},
        )

        assert resp.status_code == 200
        assert resp.json()["legs"] == [{"distance_m": None, "duration_s": None}]


class TestValidation:
    def test_too_many_destinations_rejected(self, client):
        resp = client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": [VALLEY] * 301},
        )
        assert resp.status_code == 422

    def test_empty_destinations_rejected(self, client):
        resp = client.post(
            "/api/v1/routing/matrix",
            json={"origin": ORIGIN, "destinations": []},
        )
        assert resp.status_code == 422

    def test_out_of_range_coordinate_rejected(self, client):
        resp = client.post(
            "/api/v1/routing/matrix",
            json={"origin": {"latitude": 91.0, "longitude": 5.0}, "destinations": [VALLEY]},
        )
        assert resp.status_code == 422


class TestServiceDirect:
    def test_cache_eviction_keeps_cache_bounded(self, monkeypatch):
        from app.schemas.routing import Coordinate, RouteLeg

        monkeypatch.setattr(routing_service, "MAX_CACHE_ENTRIES", 10)

        def fake_get(url, params=None, timeout=None):
            return FakeResponse(osrm_payload((100.0, 60.0)))

        monkeypatch.setattr(routing_service.httpx, "get", fake_get)

        service = RoutingService()
        for i in range(40):
            service.get_matrix(
                Coordinate(latitude=45.0, longitude=5.0),
                [Coordinate(latitude=45.0 + i / 1000, longitude=6.0)],
            )

        assert len(routing_service._cache) <= 10
