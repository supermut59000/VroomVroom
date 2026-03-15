class VehicleCard {
    constructor() {}

    createVehicleCard(vehicle, stats = {}, costStats = null) {
        const isActive = vehicle.is_active;
        
        return `
            <div class="vehicle-card ${!isActive ? 'inactive' : ''}" data-vehicle-id="${vehicle.id}">
                <div class="vehicle-header">
                    <div class="vehicle-title">
                        <h3>${vehicle.brand} ${vehicle.model}</h3>
                        <div class="vehicle-subtitle">${vehicle.year} • ${vehicle.license_plate}</div>
                    </div>
                    <span class="vehicle-status ${isActive ? 'status-active' : 'status-inactive'}">
                        ${isActive ? 'Actif' : 'Inactif'}
                    </span>
                </div>

                <div class="vehicle-info">
                    <div class="info-row">
                        <span class="info-label">
                            <i class="icon-fuel"></i> Carburant
                        </span>
                        <span class="fuel-type fuel-${vehicle.fuel_type}">
                            ${this.getFuelTypeLabel(vehicle.fuel_type)}
                        </span>
                    </div>
                    
                    ${stats.last_odometer ? `
                        <div class="info-row">
                            <span class="info-label">Kilométrage</span>
                            <span class="info-value">
                                ${stats.last_odometer?.toLocaleString()} km
                                ${stats.current_insurance_km_limit ?
                                    `<span style="color: #666;"> / ${stats.current_insurance_km_limit.toLocaleString()} km</span>
                                    <span class="insurance-indicator ${this.getInsuranceStatusClass(stats)}"
                                          title="${this.getInsuranceStatusText(stats)}">
                                        ${this.getInsuranceStatusIcon(stats)}
                                    </span>`
                                    : ''}
                            </span>
                        </div>
                    ` : ''}
                    
                    ${stats.days_since_last_entry !== null ? `
                        <div class="info-row">
                            <span class="info-label">
                                <i class="icon-calendar"></i> Dernier plein
                            </span>
                            <span class="info-value">
                                ${stats.days_since_last_entry === 0 ? "Aujourd'hui" : 
                                  stats.days_since_last_entry === 1 ? "Hier" : 
                                  `Il y a ${stats.days_since_last_entry} jours`}
                            </span>
                        </div>
                    ` : ''}
                </div>

                ${this.renderVehicleStats(stats)}
                ${this.renderMonthlyCosts(costStats)}

                <div class="vehicle-actions">
                    <button class="btn-circle fuel-btn" data-vehicle-id="${vehicle.id}" data-tooltip="Ajouter plein">⛽</button>
                    <button class="btn-circle stats-btn" data-vehicle-id="${vehicle.id}" data-tooltip="Voir détails">📊</button>
                    <button class="btn-circle action-btn view-fuel" data-vehicle-id="${vehicle.id}" title="Voir les pleins">📋</button>
                    <button class="btn-circle maintenance-btn" data-vehicle-id="${vehicle.id}" data-tooltip="Maintenance">🔧</button>
                    <button class="btn-circle delete-btn" data-vehicle-id="${vehicle.id}"  data-tooltip="Supprimer">🗑️</button>
                </div>
            </div>
        `;
    }

    renderVehicleStats(stats) {
        if (!stats.total_fuel_entries) {
            return `
                <div class="vehicle-stats">
                    <div class="stat-item">
                        <span class="stat-value">-</span>
                        <span class="stat-label">Aucune donnée</span>
                    </div>
                </div>
            `;
        }

        return `
            <div class="vehicle-stats">
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-value">${stats.total_fuel_entries}</span>
                        <span class="stat-label">Pleins</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">
                            ${stats.average_consumption ? 
                                stats.average_consumption.toFixed(1) + ' L' : '-'}
                        </span>
                        <span class="stat-label">Conso/100km</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">
                            ${(stats.total_distance || 0).toLocaleString()} km
                        </span>
                        <span class="stat-label">Distance totale</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">
                            ${(stats.total_fuel_cost || 0).toFixed(0)} €
                        </span>
                        <span class="stat-label">Coût total</span>
                    </div>
                </div>
            </div>
        `;
    }

    renderMonthlyCosts(costStats) {
        if (!costStats || (costStats.thisMonth === 0 && costStats.monthlyAverage === 0)) return '';

        const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin',
                            'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
        const now = new Date();
        const monthLabel = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

        return `
            <div class="vehicle-monthly-costs">
                <div class="monthly-cost-item">
                    <span class="monthly-cost-label">📅 ${monthLabel}</span>
                    <span class="monthly-cost-value">${costStats.thisMonth.toFixed(2)} €</span>
                </div>
                <div class="monthly-cost-item">
                    <span class="monthly-cost-label">📊 Moy. mensuelle (12 mois)</span>
                    <span class="monthly-cost-value">${costStats.monthlyAverage.toFixed(2)} €/mois</span>
                </div>
            </div>
        `;
    }

    getInsuranceStatusClass(stats) {
        if (!stats.current_insurance_km_limit) return '';

        if (stats.insurance_km_exceeded) {
            return 'status-exceeded';
        }

        const remaining = stats.insurance_km_remaining || 0;
        const limit = stats.current_insurance_km_limit;
        const percentageRemaining = (remaining / limit) * 100;

        if (percentageRemaining < 10) {
            return 'status-warning';
        } else if (percentageRemaining < 25) {
            return 'status-caution';
        } else {
            return 'status-ok';
        }
    }

    getInsuranceStatusIcon(stats) {
        if (!stats.current_insurance_km_limit) return '';

        if (stats.insurance_km_exceeded) {
            return '⚠️';
        }

        const remaining = stats.insurance_km_remaining || 0;
        const limit = stats.current_insurance_km_limit;
        const percentageRemaining = (remaining / limit) * 100;

        if (percentageRemaining < 10) {
            return '🔴';
        } else if (percentageRemaining < 25) {
            return '🟡';
        } else {
            return '🟢';
        }
    }

    getInsuranceStatusText(stats) {
        if (!stats.current_insurance_km_limit) return '';

        if (stats.insurance_km_exceeded) {
            const exceeded = Math.abs(stats.insurance_km_remaining || 0);
            return `Limite dépassée de ${exceeded.toLocaleString()} km`;
        }

        const remaining = stats.insurance_km_remaining || 0;
        return `Il reste ${remaining.toLocaleString()} km autorisés`;
    }

    getFuelTypeLabel(fuelType) {
        const labels = {
            'essence': 'Essence',
            'diesel': 'Diesel',
            'electrique': 'Électrique',
            'hybride': 'Hybride',
            'gpl': 'GPL'
        };
        return labels[fuelType] || fuelType;
    }
}

export default VehicleCard;
