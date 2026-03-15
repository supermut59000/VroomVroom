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
