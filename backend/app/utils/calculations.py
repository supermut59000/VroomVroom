import math


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance in metres between two GPS coordinates."""
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def calculate_fuel_consumption(distance_km: float, fuel_liters: float) -> float:
    """Calcule la consommation en L/100km"""
    if distance_km <= 0:
        return 0.0
    return (fuel_liters * 100) / distance_km

def calculate_cost_per_km(total_cost: float, distance_km: float) -> float:
    """Calcule le coût au kilomètre"""
    if distance_km <= 0:
        return 0.0
    return total_cost / distance_km
