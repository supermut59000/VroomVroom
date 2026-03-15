class FuelCharts {
    constructor() {
        this.overlay = null;
        this.isVisible = false;
        this.currentVehicle = null;
        this.allFuelEntries = [];
        this.maintenanceEntries = [];
        this.consumptionChart = null;
        this.priceChart = null;
        this.odometerChart = null;
        this.costChart = null;
        this.mapInstance = null;
        this.chartFilters = { startDate: null, endDate: null };

        this.handleEscape = (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                e.stopImmediatePropagation();
                this.hide();
            }
        };
    }

    show(vehicle, allEntries, maintenanceEntries = []) {
        this.currentVehicle = vehicle;
        this.allFuelEntries = allEntries;
        this.maintenanceEntries = maintenanceEntries;
        this.chartFilters = { startDate: null, endDate: null };

        this.createPopup();
        this.renderChartFilters();
        this.renderAllCharts();

        this.isVisible = true;
        this.overlay.classList.add('show');
        document.addEventListener('keydown', this.handleEscape);
    }

    hide() {
        if (this.overlay) {
            this.overlay.classList.add('hiding');
            document.removeEventListener('keydown', this.handleEscape);

            if (this.consumptionChart) { this.consumptionChart.destroy(); this.consumptionChart = null; }
            if (this.priceChart) { this.priceChart.destroy(); this.priceChart = null; }
            if (this.odometerChart) { this.odometerChart.destroy(); this.odometerChart = null; }
            if (this.costChart) { this.costChart.destroy(); this.costChart = null; }
            if (this.mapInstance) { this.mapInstance.remove(); this.mapInstance = null; }

            setTimeout(() => {
                if (this.overlay) { this.overlay.remove(); this.overlay = null; }
                this.isVisible = false;
            }, 300);
        }
    }

    createPopup() {
        if (this.overlay) this.overlay.remove();

        this.overlay = document.createElement('div');
        this.overlay.className = 'popup-overlay';
        this.overlay.id = 'fuelChartsPopup';

        this.overlay.innerHTML = `
            <div class="popup-container fuel-view-container">
                <div class="popup-header">
                    <h2 class="popup-title">
                        📊 Graphiques - ${this.currentVehicle.brand} ${this.currentVehicle.model}
                    </h2>
                    <button type="button" class="popup-close">&times;</button>
                </div>
                <div class="popup-body">
                    <div id="chartsFilterSection"></div>
                    <div id="consumptionChartSection" class="fuel-chart-section"></div>
                    <div id="priceChartSection" class="fuel-chart-section"></div>
                    <div id="odometerChartSection" class="fuel-chart-section"></div>
                    <div id="costPerKmSection" class="fuel-chart-section"></div>
                    <div id="stationsMapSection" class="fuel-chart-section"></div>
                </div>
                <div class="popup-footer">
                    <button type="button" class="btn btn-secondary" id="closeChartsBtn">Fermer</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);

        this.overlay.querySelector('.popup-close').addEventListener('click', () => this.hide());
        document.getElementById('closeChartsBtn').addEventListener('click', () => this.hide());
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.hide();
        });
    }

    // ===== FILTERS =====

    renderChartFilters() {
        const container = document.getElementById('chartsFilterSection');
        if (!container) return;

        container.innerHTML = `
            <div class="chart-filter-section">
                <div class="chart-filter-container">
                    <h4 class="filter-title">Filtres des graphiques</h4>
                    <div class="filter-controls">
                        <div class="filter-group">
                            <label for="chartsStartDate">Du</label>
                            <input type="date" id="chartsStartDate" class="filter-input">
                        </div>
                        <div class="filter-group">
                            <label for="chartsEndDate">Au</label>
                            <input type="date" id="chartsEndDate" class="filter-input">
                        </div>
                        <div class="filter-actions">
                            <button type="button" class="btn btn-primary btn-sm" id="applyChartsFilters">Appliquer</button>
                            <button type="button" class="btn btn-secondary btn-sm" id="resetChartsFilters">Réinitialiser</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('applyChartsFilters').addEventListener('click', () => {
            this.chartFilters.startDate = document.getElementById('chartsStartDate').value || null;
            this.chartFilters.endDate = document.getElementById('chartsEndDate').value || null;
            this.renderAllCharts();
        });

        document.getElementById('resetChartsFilters').addEventListener('click', () => {
            this.chartFilters = { startDate: null, endDate: null };
            document.getElementById('chartsStartDate').value = '';
            document.getElementById('chartsEndDate').value = '';
            this.renderAllCharts();
        });
    }

    getFilteredEntries() {
        let entries = [...this.allFuelEntries];

        if (this.chartFilters.startDate) {
            const start = new Date(this.chartFilters.startDate);
            entries = entries.filter(e => new Date(e.fueling_date) >= start);
        }
        if (this.chartFilters.endDate) {
            const end = new Date(this.chartFilters.endDate);
            end.setHours(23, 59, 59, 999);
            entries = entries.filter(e => new Date(e.fueling_date) <= end);
        }

        entries.sort((a, b) => new Date(a.fueling_date) - new Date(b.fueling_date));
        return entries;
    }

    // ===== CHARTS =====

    renderAllCharts() {
        this.renderConsumptionChart();
        this.renderPriceChart();
        this.renderOdometerChart();
        this.renderCostPerKmChart();
        this.renderStationsMap();
    }

    renderConsumptionChart() {
        const container = document.getElementById('consumptionChartSection');
        if (!container) return;

        const filtered = this.getFilteredEntries();

        if (filtered.length < 2) {
            container.innerHTML = `
                <div class="fuel-chart-container">
                    <div class="chart-header"><h3>Consommation (L/100km)</h3></div>
                    <div class="no-data-message">
                        <p>Ajoutez au moins deux pleins pour voir la consommation.</p>
                    </div>
                </div>
            `;
            return;
        }

        const dataPoints = [];
        let accumulatedLiters = 0;
        let lastFullTankOdo = null;

        for (let i = 0; i < filtered.length; i++) {
            const entry = filtered[i];
            const isFull = entry.is_full_tank !== false;

            if (i === 0) {
                lastFullTankOdo = entry.odometer_reading;
                accumulatedLiters = 0;
            } else {
                accumulatedLiters += entry.liters;
                if (isFull && lastFullTankOdo !== null) {
                    const distance = entry.odometer_reading - lastFullTankOdo;
                    if (distance > 0) {
                        dataPoints.push({
                            date: entry.fueling_date,
                            consumption: (accumulatedLiters * 100) / distance,
                            distance: distance,
                            liters: accumulatedLiters
                        });
                    }
                    lastFullTankOdo = entry.odometer_reading;
                    accumulatedLiters = 0;
                }
            }
        }

        if (dataPoints.length === 0) {
            container.innerHTML = `
                <div class="fuel-chart-container">
                    <div class="chart-header"><h3>Consommation (L/100km)</h3></div>
                    <div class="no-data-message">
                        <p>Pas assez de pleins complets pour calculer la consommation.</p>
                    </div>
                </div>
            `;
            return;
        }

        const labels = dataPoints.map(p => {
            const d = new Date(p.date);
            return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
        });
        const values = dataPoints.map(p => p.consumption);
        const avgConsumption = values.reduce((a, b) => a + b, 0) / values.length;

        container.innerHTML = `
            <div class="fuel-chart-container">
                <div class="chart-header"><h3>Consommation (L/100km)</h3></div>
                <div class="chart-wrapper"><canvas id="chartConsumption"></canvas></div>
            </div>
        `;

        const ctx = document.getElementById('chartConsumption').getContext('2d');
        if (this.consumptionChart) this.consumptionChart.destroy();

        this.consumptionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Consommation (L/100km)',
                        data: values,
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        tension: 0.3, fill: true,
                        pointRadius: 5, pointHoverRadius: 7,
                        pointBackgroundColor: 'rgb(75, 192, 192)',
                        pointBorderColor: '#fff', pointBorderWidth: 2,
                    },
                    {
                        label: 'Moyenne',
                        data: Array(values.length).fill(avgConsumption),
                        borderColor: 'rgb(255, 99, 132)',
                        borderDash: [5, 5], borderWidth: 2,
                        fill: false, pointRadius: 0, pointHoverRadius: 0,
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: true, aspectRatio: 2,
                plugins: {
                    legend: { display: true, position: 'top', labels: { usePointStyle: true, padding: 15, font: { size: 12 } } },
                    tooltip: {
                        mode: 'index', intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        callbacks: {
                            label: (ctx) => {
                                let l = ctx.dataset.label || '';
                                if (l) l += ': ';
                                if (ctx.parsed.y !== null) l += ctx.parsed.y.toFixed(2) + ' L/100km';
                                return l;
                            },
                            afterBody: (tooltipItems) => {
                                const p = dataPoints[tooltipItems[0].dataIndex];
                                return [`Distance: ${p.distance} km`, `Litres: ${p.liters.toFixed(1)} L`];
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        title: { display: true, text: 'Consommation (L/100km)', font: { size: 13, weight: 'bold' } },
                        ticks: { callback: (v) => v.toFixed(1) + ' L' },
                        grid: { color: 'rgba(0, 0, 0, 0.05)' }
                    },
                    x: {
                        title: { display: true, text: 'Date de plein', font: { size: 13, weight: 'bold' } },
                        grid: { display: false },
                        ticks: { maxRotation: 45, minRotation: 45 }
                    }
                }
            }
        });
    }

    renderPriceChart() {
        const container = document.getElementById('priceChartSection');
        if (!container) return;

        const filtered = this.getFilteredEntries();

        if (filtered.length < 2) {
            container.innerHTML = '';
            return;
        }

        const labels = filtered.map(e => {
            const d = new Date(e.fueling_date);
            return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
        });
        const prices = filtered.map(e => e.price_per_liter);
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

        container.innerHTML = `
            <div class="fuel-chart-container">
                <div class="chart-header"><h3>Prix du carburant (€/L)</h3></div>
                <div class="chart-wrapper"><canvas id="chartPrice"></canvas></div>
            </div>
        `;

        const ctx = document.getElementById('chartPrice').getContext('2d');
        if (this.priceChart) this.priceChart.destroy();

        this.priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Prix/litre (€)',
                        data: prices,
                        borderColor: 'rgb(255, 159, 64)',
                        backgroundColor: 'rgba(255, 159, 64, 0.2)',
                        tension: 0.3, fill: true,
                        pointRadius: 5, pointHoverRadius: 7,
                        pointBackgroundColor: 'rgb(255, 159, 64)',
                        pointBorderColor: '#fff', pointBorderWidth: 2,
                    },
                    {
                        label: 'Moyenne',
                        data: Array(prices.length).fill(avgPrice),
                        borderColor: 'rgb(255, 99, 132)',
                        borderDash: [5, 5], borderWidth: 2,
                        fill: false, pointRadius: 0, pointHoverRadius: 0,
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: true, aspectRatio: 2,
                plugins: {
                    legend: { display: true, position: 'top', labels: { usePointStyle: true, padding: 15, font: { size: 12 } } },
                    tooltip: {
                        mode: 'index', intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        callbacks: {
                            label: (ctx) => {
                                let l = ctx.dataset.label || '';
                                if (l) l += ': ';
                                if (ctx.parsed.y !== null) l += ctx.parsed.y.toFixed(3) + ' €';
                                return l;
                            },
                            afterBody: (tooltipItems) => {
                                const entry = filtered[tooltipItems[0].dataIndex];
                                return [
                                    `Litres: ${entry.liters} L`,
                                    `Total: ${(entry.liters * entry.price_per_liter).toFixed(2)} €`,
                                    `Station: ${entry.station_name || '-'}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        title: { display: true, text: 'Prix (€/L)', font: { size: 13, weight: 'bold' } },
                        ticks: { callback: (v) => v.toFixed(3) + ' €' },
                        grid: { color: 'rgba(0, 0, 0, 0.05)' }
                    },
                    x: {
                        title: { display: true, text: 'Date de plein', font: { size: 13, weight: 'bold' } },
                        grid: { display: false },
                        ticks: { maxRotation: 45, minRotation: 45 }
                    }
                }
            }
        });
    }

    renderOdometerChart() {
        const container = document.getElementById('odometerChartSection');
        if (!container) return;

        const filtered = this.getFilteredEntries();

        if (filtered.length < 2) {
            container.innerHTML = '';
            return;
        }

        // Calculate km driven per month
        const monthlyKm = {};
        for (let i = 1; i < filtered.length; i++) {
            const distance = filtered[i].odometer_reading - filtered[i - 1].odometer_reading;
            if (distance > 0) {
                const date = new Date(filtered[i].fueling_date);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                monthlyKm[monthKey] = (monthlyKm[monthKey] || 0) + distance;
            }
        }

        const sortedMonths = Object.keys(monthlyKm).sort();
        if (sortedMonths.length === 0) {
            container.innerHTML = '';
            return;
        }

        const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
        const labels = sortedMonths.map(key => {
            const [year, month] = key.split('-');
            return `${monthNames[parseInt(month) - 1]} ${year}`;
        });
        const values = sortedMonths.map(key => monthlyKm[key]);
        const avgKm = values.reduce((a, b) => a + b, 0) / values.length;

        container.innerHTML = `
            <div class="fuel-chart-container">
                <div class="chart-header"><h3>Kilomètres parcourus par mois</h3></div>
                <div class="chart-wrapper"><canvas id="chartOdometer"></canvas></div>
            </div>
        `;

        const ctx = document.getElementById('chartOdometer').getContext('2d');
        if (this.odometerChart) this.odometerChart.destroy();

        this.odometerChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'km parcourus',
                        data: values,
                        backgroundColor: 'rgba(153, 102, 255, 0.6)',
                        borderColor: 'rgb(153, 102, 255)',
                        borderWidth: 2,
                        borderRadius: 4,
                    },
                    {
                        label: 'Moyenne',
                        data: Array(values.length).fill(avgKm),
                        type: 'line',
                        borderColor: 'rgb(255, 99, 132)',
                        borderDash: [5, 5], borderWidth: 2,
                        fill: false, pointRadius: 0, pointHoverRadius: 0,
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: true, aspectRatio: 2,
                plugins: {
                    legend: { display: true, position: 'top', labels: { usePointStyle: true, padding: 15, font: { size: 12 } } },
                    tooltip: {
                        mode: 'index', intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        callbacks: {
                            label: (ctx) => {
                                let l = ctx.dataset.label || '';
                                if (l) l += ': ';
                                if (ctx.parsed.y !== null) l += ctx.parsed.y.toLocaleString('fr-FR') + ' km';
                                return l;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        title: { display: true, text: 'Kilomètres', font: { size: 13, weight: 'bold' } },
                        ticks: { callback: (v) => v.toLocaleString('fr-FR') + ' km' },
                        grid: { color: 'rgba(0, 0, 0, 0.05)' },
                        beginAtZero: true
                    },
                    x: {
                        title: { display: true, text: 'Mois', font: { size: 13, weight: 'bold' } },
                        grid: { display: false },
                        ticks: { maxRotation: 45, minRotation: 45 }
                    }
                }
            }
        });
    }

    renderCostPerKmChart() {
        const container = document.getElementById('costPerKmSection');
        if (!container) return;

        const filtered = this.getFilteredEntries();

        if (filtered.length < 2) {
            container.innerHTML = '';
            return;
        }

        // Monthly km from consecutive fuel entries
        const monthlyKm = {};
        for (let i = 1; i < filtered.length; i++) {
            const distance = filtered[i].odometer_reading - filtered[i - 1].odometer_reading;
            if (distance > 0) {
                const d = new Date(filtered[i].fueling_date);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                monthlyKm[key] = (monthlyKm[key] || 0) + distance;
            }
        }

        // Monthly fuel cost
        const monthlyFuelCost = {};
        for (const entry of filtered) {
            const d = new Date(entry.fueling_date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlyFuelCost[key] = (monthlyFuelCost[key] || 0) + (entry.liters * entry.price_per_liter);
        }

        // Monthly maintenance cost
        const monthlyMaintCost = {};
        for (const entry of this.maintenanceEntries) {
            const d = new Date(entry.maintenance_date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlyMaintCost[key] = (monthlyMaintCost[key] || 0) + entry.cost;
        }

        const months = Object.keys(monthlyKm).sort();
        if (months.length === 0) {
            container.innerHTML = '';
            return;
        }

        const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
        const labels = months.map(key => {
            const [year, month] = key.split('-');
            return `${monthNames[parseInt(month) - 1]} ${year}`;
        });

        const fuelPerKm = months.map(key => {
            const km = monthlyKm[key];
            return km > 0 ? parseFloat(((monthlyFuelCost[key] || 0) / km * 100).toFixed(2)) : 0;
        });

        const maintPerKm = months.map(key => {
            const km = monthlyKm[key];
            return km > 0 ? parseFloat(((monthlyMaintCost[key] || 0) / km * 100).toFixed(2)) : 0;
        });

        container.innerHTML = `
            <div class="fuel-chart-container">
                <div class="chart-header"><h3>Coût par 100km (carburant + entretien)</h3></div>
                <div class="chart-wrapper"><canvas id="chartCostPerKm"></canvas></div>
            </div>
        `;

        const ctx = document.getElementById('chartCostPerKm').getContext('2d');
        if (this.costChart) this.costChart.destroy();

        this.costChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Carburant (€/100km)',
                        data: fuelPerKm,
                        backgroundColor: 'rgba(54, 162, 235, 0.7)',
                        borderColor: 'rgb(54, 162, 235)',
                        borderWidth: 2,
                        borderRadius: 4,
                    },
                    {
                        label: 'Entretien (€/100km)',
                        data: maintPerKm,
                        backgroundColor: 'rgba(255, 159, 64, 0.7)',
                        borderColor: 'rgb(255, 159, 64)',
                        borderWidth: 2,
                        borderRadius: 4,
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: true, aspectRatio: 2,
                plugins: {
                    legend: { display: true, position: 'top', labels: { usePointStyle: true, padding: 15, font: { size: 12 } } },
                    tooltip: {
                        mode: 'index', intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        callbacks: {
                            label: (ctx) => {
                                let l = ctx.dataset.label || '';
                                if (l) l += ': ';
                                if (ctx.parsed.y !== null) l += ctx.parsed.y.toFixed(2) + ' €';
                                return l;
                            },
                            afterBody: (tooltipItems) => {
                                const idx = tooltipItems[0].dataIndex;
                                const total = (fuelPerKm[idx] + maintPerKm[idx]).toFixed(2);
                                const km = monthlyKm[months[idx]];
                                return [`Total: ${total} €/100km`, `Distance: ${km.toLocaleString('fr-FR')} km`];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        title: { display: true, text: 'Mois', font: { size: 13, weight: 'bold' } },
                        grid: { display: false },
                        ticks: { maxRotation: 45, minRotation: 45 }
                    },
                    y: {
                        stacked: true,
                        title: { display: true, text: 'Coût (€/100km)', font: { size: 13, weight: 'bold' } },
                        ticks: { callback: (v) => v.toFixed(2) + ' €' },
                        grid: { color: 'rgba(0, 0, 0, 0.05)' },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    renderStationsMap() {
        const container = document.getElementById('stationsMapSection');
        if (!container) return;

        // Destroy previous map instance before re-rendering
        if (this.mapInstance) { this.mapInstance.remove(); this.mapInstance = null; }

        const entriesWithCoords = this.allFuelEntries.filter(
            e => e.latitude != null && e.longitude != null
        );

        if (entriesWithCoords.length === 0) {
            container.innerHTML = `
                <div class="fuel-chart-container">
                    <div class="chart-header"><h3>🗺️ Carte des stations</h3></div>
                    <div class="no-data-message">
                        <p>Aucune entrée avec coordonnées GPS.<br>
                        Utilisez le bouton 📍 lors de l'ajout d'un plein pour capturer votre position.</p>
                    </div>
                </div>
            `;
            return;
        }

        // Check Leaflet is available
        if (typeof L === 'undefined') {
            container.innerHTML = `
                <div class="fuel-chart-container">
                    <div class="chart-header"><h3>🗺️ Carte des stations</h3></div>
                    <div class="no-data-message"><p>Leaflet.js non chargé. Vérifiez votre connexion internet.</p></div>
                </div>
            `;
            return;
        }

        // Keep only the latest fuel entry per station location (rounded to ~11m precision)
        const latestByStation = {};
        entriesWithCoords.forEach(entry => {
            const key = `${entry.latitude.toFixed(4)},${entry.longitude.toFixed(4)}`;
            if (!latestByStation[key] || new Date(entry.fueling_date) > new Date(latestByStation[key].fueling_date)) {
                latestByStation[key] = entry;
            }
        });
        const uniqueStations = Object.values(latestByStation);

        container.innerHTML = `
            <div class="fuel-chart-container">
                <div class="chart-header"><h3>🗺️ Carte des stations (${uniqueStations.length} stations)</h3></div>
                <div id="stationsMap"></div>
            </div>
        `;

        const avgLat = uniqueStations.reduce((s, e) => s + e.latitude, 0) / uniqueStations.length;
        const avgLng = uniqueStations.reduce((s, e) => s + e.longitude, 0) / uniqueStations.length;

        this.mapInstance = L.map('stationsMap').setView([avgLat, avgLng], 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 18
        }).addTo(this.mapInstance);

        uniqueStations.forEach(entry => {
            const d = new Date(entry.fueling_date).toLocaleDateString('fr-FR');
            const total = (entry.liters * entry.price_per_liter).toFixed(2);
            const popup = `
                <strong>${entry.station_name || 'Station'}</strong><br>
                📅 ${d} (dernier plein)<br>
                ⛽ ${entry.liters} L — ${entry.price_per_liter} €/L<br>
                💰 Total: ${total} €
            `;
            L.marker([entry.latitude, entry.longitude])
                .addTo(this.mapInstance)
                .bindPopup(popup);
        });

        // Fit map to all markers
        const bounds = L.latLngBounds(uniqueStations.map(e => [e.latitude, e.longitude]));
        this.mapInstance.fitBounds(bounds, { padding: [30, 30] });

        // Fix tiles only loading in top-left: recalculate map size after container is fully rendered
        setTimeout(() => {
            if (this.mapInstance) this.mapInstance.invalidateSize();
        }, 400);
    }
}

export default FuelCharts;
