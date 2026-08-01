import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional, Tuple

import httpx

from app.core.config import settings
from app.schemas.routing import Coordinate, RouteLeg

logger = logging.getLogger(__name__)

# 4 decimals ~ 11 m: a GPS reading that drifts a few metres between two
# openings of the dialog reuses the cached answer instead of re-querying.
COORD_PRECISION = 4

# Legs are ~100 bytes each; 5000 covers every station the user will ever
# look at from every place they'll ever stand, and bounds memory anyway.
MAX_CACHE_ENTRIES = 5000

CacheKey = Tuple[float, float, float, float]

# Module-level so the cache survives across requests (services are per-request).
_cache: Dict[CacheKey, Tuple[float, RouteLeg]] = {}
_cache_lock = threading.Lock()


def _cache_key(origin: Coordinate, destination: Coordinate) -> CacheKey:
    return (
        round(origin.latitude, COORD_PRECISION),
        round(origin.longitude, COORD_PRECISION),
        round(destination.latitude, COORD_PRECISION),
        round(destination.longitude, COORD_PRECISION),
    )


def clear_cache() -> None:
    """Drop every cached leg. Used by tests."""
    with _cache_lock:
        _cache.clear()


class RoutingService:
    """Road distance/time from one origin to many destinations.

    Wraps an OSRM-compatible `table` service. Caching is per origin/destination
    *pair*, not per request, so changing the fuel type or the search radius
    reuses everything already known and only asks about genuinely new stations.
    """

    def get_matrix(
        self,
        origin: Coordinate,
        destinations: List[Coordinate],
    ) -> Tuple[List[RouteLeg], bool]:
        """Return one leg per destination, in the order given, plus whether
        every leg was served from cache."""
        now = time.monotonic()
        legs: List[Optional[RouteLeg]] = [None] * len(destinations)
        misses: List[int] = []

        with _cache_lock:
            self._evict(now)
            for index, destination in enumerate(destinations):
                entry = _cache.get(_cache_key(origin, destination))
                if entry is not None and entry[0] > now:
                    legs[index] = entry[1]
                else:
                    misses.append(index)

        if not misses:
            # No misses means every slot was filled above.
            return [leg or RouteLeg() for leg in legs], True

        fetched = self._fetch(origin, [destinations[i] for i in misses])
        expires_at = now + settings.ROUTING_CACHE_TTL

        with _cache_lock:
            for slot, index in enumerate(misses):
                leg = fetched[slot]
                legs[index] = leg
                # Never cache a failure: a provider outage must not blank out
                # the distances for the whole TTL.
                if leg.distance_m is not None:
                    _cache[_cache_key(origin, destinations[index])] = (expires_at, leg)

        return [leg if leg is not None else RouteLeg() for leg in legs], False

    def _evict(self, now: float) -> None:
        """Caller must hold the lock."""
        if len(_cache) < MAX_CACHE_ENTRIES:
            return
        for key in [k for k, (expires_at, _) in _cache.items() if expires_at <= now]:
            del _cache[key]
        # Still full of live entries — drop the soonest to expire (oldest first).
        if len(_cache) >= MAX_CACHE_ENTRIES:
            overflow = len(_cache) - MAX_CACHE_ENTRIES + 1
            for key in sorted(_cache, key=lambda k: _cache[k][0])[:overflow]:
                del _cache[key]

    def _fetch(self, origin: Coordinate, destinations: List[Coordinate]) -> List[RouteLeg]:
        """Query the provider, splitting into batches it will accept.

        A 50 km search can hold a few hundred stations, well past any provider's
        table limit. Batches run concurrently so total latency stays close to a
        single round trip instead of adding up.
        """
        batch_size = max(1, settings.ROUTING_MAX_BATCH)
        batches = [
            destinations[start : start + batch_size]
            for start in range(0, len(destinations), batch_size)
        ]

        if len(batches) == 1:
            return self._fetch_batch(origin, batches[0])

        workers = min(len(batches), max(1, settings.ROUTING_MAX_CONCURRENCY))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            # executor.map preserves input order, so the batches reassemble
            # into the caller's destination order.
            results = list(pool.map(lambda b: self._fetch_batch(origin, b), batches))

        legs: List[RouteLeg] = []
        for batch_legs in results:
            legs.extend(batch_legs)
        return legs

    def _fetch_batch(self, origin: Coordinate, destinations: List[Coordinate]) -> List[RouteLeg]:
        """One provider request. Returns empty legs (never raises) on any
        failure — the station list stays usable with straight-line distances."""
        try:
            if settings.ROUTING_PROVIDER.lower() == "valhalla":
                return self._fetch_valhalla(origin, destinations)
            return self._fetch_osrm(origin, destinations)
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            logger.warning("Routing provider unavailable: %s", exc)
            return [RouteLeg() for _ in destinations]

    def _fetch_osrm(self, origin: Coordinate, destinations: List[Coordinate]) -> List[RouteLeg]:
        # OSRM takes lon,lat pairs; the origin is coordinate 0, so destination
        # j sits at column j+1 of the returned 1 x (n+1) row.
        points = ";".join(
            f"{point.longitude},{point.latitude}" for point in [origin] + destinations
        )
        url = (
            f"{settings.ROUTING_URL.rstrip('/')}"
            f"/table/v1/{settings.ROUTING_PROFILE}/{points}"
        )

        response = httpx.get(
            url,
            params={"sources": "0", "annotations": "duration,distance"},
            timeout=settings.ROUTING_TIMEOUT,
        )
        response.raise_for_status()
        payload = response.json()

        if payload.get("code") != "Ok":
            logger.warning("Routing provider returned %s", payload.get("code"))
            return [RouteLeg() for _ in destinations]

        durations = (payload.get("durations") or [[]])[0]
        distances = (payload.get("distances") or [[]])[0]

        legs: List[RouteLeg] = []
        for index in range(len(destinations)):
            column = index + 1
            duration = durations[column] if column < len(durations) else None
            distance = distances[column] if column < len(distances) else None
            # OSRM returns null for a destination it cannot reach by road.
            if duration is None or distance is None:
                legs.append(RouteLeg())
            else:
                legs.append(RouteLeg(distance_m=float(distance), duration_s=float(duration)))
        return legs

    def _fetch_valhalla(self, origin: Coordinate, destinations: List[Coordinate]) -> List[RouteLeg]:
        """Valhalla's matrix endpoint.

        Unlike OSRM it takes one source and N targets explicitly, so there is no
        origin column to skip. Distances come back in the requested unit —
        kilometres — and must be converted to metres.
        """
        url = f"{settings.ROUTING_URL.rstrip('/')}/sources_to_targets"
        response = httpx.post(
            url,
            json={
                "sources": [{"lat": origin.latitude, "lon": origin.longitude}],
                "targets": [
                    {"lat": point.latitude, "lon": point.longitude} for point in destinations
                ],
                "costing": settings.ROUTING_PROFILE_VALHALLA,
                "units": "kilometers",
            },
            timeout=settings.ROUTING_TIMEOUT,
        )
        response.raise_for_status()
        payload = response.json()

        rows = payload.get("sources_to_targets") or []
        row = rows[0] if rows else []

        legs: List[RouteLeg] = []
        for index in range(len(destinations)):
            cell = row[index] if index < len(row) else None
            time_s = cell.get("time") if cell else None
            distance_km = cell.get("distance") if cell else None
            # Valhalla reports null time/distance for an unreachable target.
            if time_s is None or distance_km is None:
                legs.append(RouteLeg())
            else:
                legs.append(
                    RouteLeg(distance_m=float(distance_km) * 1000.0, duration_s=float(time_s))
                )
        return legs
