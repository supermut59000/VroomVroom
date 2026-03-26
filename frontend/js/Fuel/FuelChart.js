import config, { fetchApi } from '../config.js';

export class FuelChart {
    constructor(vehicleId) {
        this.vehicleId = vehicleId;
        this.chart = null;
        this.apiUrl = config.getApiUrl();
    }

    async fetchConsumptionData() {
        try {
            const response = await fetchApi(`${this.apiUrl}/fuel-entries/vehicle/${this.vehicleId}/consumption-history`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching consumption data:', error);
            throw error;
        }
    }

    createChartHTML() {
        return `
            <div class="fuel-chart-container">
                <div class="chart-header">
                    <h3>Historique de consommation (L/100km)</h3>
                </div>
                <div class="chart-wrapper">
                    <canvas id="fuelConsumptionChart"></canvas>
                </div>
            </div>
        `;
    }

    async render(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container with id ${containerId} not found`);
            return;
        }

        try {
            // Show loading state
            container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Chargement des données...</p></div>';

            // Fetch data
            const consumptionData = await this.fetchConsumptionData();

            // Check if we have data
            if (!consumptionData.data_points || consumptionData.data_points.length === 0) {
                container.innerHTML = `
                    <div class="no-data-message">
                        <i class="icon-chart"></i>
                        <h3>Aucune donnée de consommation</h3>
                        <p>Ajoutez au moins deux pleins pour voir les statistiques de consommation.</p>
                    </div>
                `;
                return;
            }

            // Filter out data points without consumption (first entry)
            const dataWithConsumption = consumptionData.data_points.filter(point => point.consumption !== null);

            if (dataWithConsumption.length === 0) {
                container.innerHTML = `
                    <div class="no-data-message">
                        <i class="icon-chart"></i>
                        <h3>Données insuffisantes</h3>
                        <p>Ajoutez au moins deux pleins pour calculer la consommation.</p>
                    </div>
                `;
                return;
            }

            // Insert chart HTML
            container.innerHTML = this.createChartHTML();

            // Prepare chart data
            const labels = dataWithConsumption.map(point => {
                const date = new Date(point.date);
                return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
            });

            const consumptionValues = dataWithConsumption.map(point => point.consumption);

            // Calculate average for reference line
            const avgConsumption = consumptionValues.reduce((a, b) => a + b, 0) / consumptionValues.length;

            // Create the chart
            const ctx = document.getElementById('fuelConsumptionChart').getContext('2d');

            // Destroy existing chart if it exists
            if (this.chart) {
                this.chart.destroy();
            }

            this.chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Consommation (L/100km)',
                            data: consumptionValues,
                            borderColor: 'rgb(75, 192, 192)',
                            backgroundColor: 'rgba(75, 192, 192, 0.2)',
                            tension: 0.3,
                            fill: true,
                            pointRadius: 5,
                            pointHoverRadius: 7,
                            pointBackgroundColor: 'rgb(75, 192, 192)',
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2,
                        },
                        {
                            label: 'Moyenne',
                            data: Array(consumptionValues.length).fill(avgConsumption),
                            borderColor: 'rgb(255, 99, 132)',
                            backgroundColor: 'rgba(255, 99, 132, 0.1)',
                            borderDash: [5, 5],
                            borderWidth: 2,
                            fill: false,
                            pointRadius: 0,
                            pointHoverRadius: 0,
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    aspectRatio: 2,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                usePointStyle: true,
                                padding: 15,
                                font: {
                                    size: 12
                                }
                            }
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleFont: {
                                size: 14
                            },
                            bodyFont: {
                                size: 13
                            },
                            padding: 12,
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        label += context.parsed.y.toFixed(2) + ' L/100km';
                                    }
                                    return label;
                                },
                                afterBody: function(tooltipItems) {
                                    const index = tooltipItems[0].dataIndex;
                                    const point = dataWithConsumption[index];
                                    return [
                                        `Distance: ${point.distance} km`,
                                        `Plein: ${point.liters} L`
                                    ];
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: false,
                            title: {
                                display: true,
                                text: 'Consommation (L/100km)',
                                font: {
                                    size: 13,
                                    weight: 'bold'
                                }
                            },
                            ticks: {
                                callback: function(value) {
                                    return value.toFixed(1) + ' L';
                                }
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: 'Date de plein',
                                font: {
                                    size: 13,
                                    weight: 'bold'
                                }
                            },
                            grid: {
                                display: false
                            },
                            ticks: {
                                maxRotation: 45,
                                minRotation: 45
                            }
                        }
                    },
                    interaction: {
                        mode: 'nearest',
                        axis: 'x',
                        intersect: false
                    }
                }
            });

        } catch (error) {
            console.error('Error rendering chart:', error);
            container.innerHTML = `
                <div class="error-message">
                    <p>Erreur lors du chargement du graphique. Veuillez réessayer.</p>
                </div>
            `;
        }
    }

    destroy() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    }
}
