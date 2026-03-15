import VehicleAdd from './Vehicles/VehicleAdd.js';
import VehicleCard from './Vehicles/VehicleCard.js';
import VehicleDetails from './Vehicles/VehicleDetails.js';
import FuelAdd from './Fuel/FuelAdd.js';
import FuelView from './Fuel/FuelView.js';
import MaintenanceAdd from './Maintenance/MaintenanceAdd.js';
import MaintenanceView from './Maintenance/MaintenanceView.js';
import config from './config.js';

class Dashboard {
    constructor() {
        this.baseURL = config.getApiUrl();
        this.vehicles = [];
        this.vehicleStats = new Map();
        this.vehicleCostStats = new Map();

        this.initializeModules();
        this.initializeElements();
        this.attachEventListeners();
        this.setupOfflineDetection();
        this.loadVehicles();
    }

    setupOfflineDetection() {
        const banner = document.getElementById('offlineBanner');
        if (!banner) return;
        const show = () => { banner.style.display = 'block'; };
        const hide = () => { banner.style.display = 'none'; };
        window.addEventListener('online', () => {
            hide();
            this.syncOfflineQueue();
            this.loadVehicles();
        });
        window.addEventListener('offline', show);
        if (!navigator.onLine) show();
        this.updateOfflineQueueBanner();
    }

    async syncOfflineQueue() {
        const queue = JSON.parse(localStorage.getItem('vv_offline_queue') || '[]');
        if (queue.length === 0) return;

        const remaining = [];
        let synced = 0;

        for (const item of queue) {
            try {
                const response = await fetch(`${this.baseURL}/fuel-entries/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(item.data)
                });
                if (response.ok) {
                    synced++;
                } else {
                    remaining.push(item);
                }
            } catch (e) {
                remaining.push(item);
            }
        }

        localStorage.setItem('vv_offline_queue', JSON.stringify(remaining));
        this.updateOfflineQueueBanner();

        if (synced > 0) {
            this.showToast(`✓ ${synced} plein(s) synchronisé(s) avec succès`, 'success');
            this.loadVehicles();
        }
    }

    updateOfflineQueueBanner() {
        const queue = JSON.parse(localStorage.getItem('vv_offline_queue') || '[]');
        const banner = document.getElementById('offlineQueueBanner');
        const count = document.getElementById('offlineQueueCount');
        if (!banner) return;
        if (queue.length > 0) {
            if (count) count.textContent = queue.length;
            banner.style.display = 'block';
        } else {
            banner.style.display = 'none';
        }
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; top: 20px; right: 20px; padding: 14px 20px;
            border-radius: 8px; color: white; z-index: 10000; font-weight: 500;
            font-size: 15px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            background: ${type === 'success' ? '#28a745' : '#dc3545'};
            animation: slideIn 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    initializeModules() {
        this.vehicleAdd = new VehicleAdd(this.baseURL, () => this.loadVehicles());
        this.vehicleCard = new VehicleCard();
        this.fuelAdd = new FuelAdd(this.baseURL, () => {
            this.loadVehicles();
            this.updateOfflineQueueBanner();
        });
        this.vehicleDetails = new VehicleDetails(this.baseURL, () => this.loadVehicles());
        this.fuelView = new FuelView(this.baseURL, () => this.loadVehicles());
        this.maintenanceAdd = new MaintenanceAdd(this.baseURL, () => {
            this.loadVehicles();
            if (this._maintenanceViewVehicleId) {
                const vehicleId = this._maintenanceViewVehicleId;
                this._maintenanceViewVehicleId = null;
                this.maintenanceView.show(vehicleId);
            }
        });
        this.maintenanceView = new MaintenanceView(this.baseURL, () => this.loadVehicles());
        this.maintenanceView.onAddMaintenance = (vehicle) => {
            this._maintenanceViewVehicleId = vehicle.id;
            this.maintenanceView.hide();
            this.maintenanceAdd.show(vehicle);
        };
    }

    initializeElements() {
        this.vehiclesGrid = document.getElementById('vehiclesGrid');
        this.loadingSpinner = document.getElementById('loadingSpinner');
        this.errorMessage = document.getElementById('errorMessage');
        this.noVehiclesMessage = document.getElementById('noVehiclesMessage');
        this.addVehicleBtn = document.getElementById('addVehicleBtn');
        this.retryBtn = document.getElementById('retryBtn');
    }

    attachEventListeners() {
        this.addVehicleBtn.addEventListener('click', () => this.handleAddVehicle());
        this.retryBtn.addEventListener('click', () => this.loadVehicles());
    }

    async loadVehicles() {
        try {
            this.showLoading();
            const response = await fetch(`${this.baseURL}/vehicles/`);
            if (!response.ok) throw new Error('Erreur lors du chargement des véhicules');
            this.vehicles = await response.json();
            await this.loadVehicleStats();
            this.renderVehicles();
            this.hideLoading();
        } catch (error) {
            console.error('Erreur:', error);
            this.showError();
        }
    }

    async loadVehicleStats() {
        await Promise.all(this.vehicles.map(async (vehicle) => {
            try {
                const [statsRes, costStats] = await Promise.all([
                    fetch(`${this.baseURL}/vehicles/${vehicle.id}/stats`),
                    this.loadVehicleCostStats(vehicle.id)
                ]);
                if (statsRes.ok) {
                    this.vehicleStats.set(vehicle.id, await statsRes.json());
                }
                this.vehicleCostStats.set(vehicle.id, costStats);
            } catch (error) {
                console.warn(`Stats error for vehicle ${vehicle.id}:`, error);
            }
        }));
    }

    async loadVehicleCostStats(vehicleId) {
        const now = new Date();
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const yearAgo = new Date(now);
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);

        try {
            const [fuelRes, maintRes] = await Promise.all([
                fetch(`${this.baseURL}/fuel-entries/vehicle/${vehicleId}?per_page=10000`),
                fetch(`${this.baseURL}/maintenances/vehicle/${vehicleId}`)
            ]);

            let thisMonthCost = 0;
            let annualCost = 0;

            if (fuelRes.ok) {
                const entries = await fuelRes.json();
                for (const e of entries) {
                    const cost = e.liters * e.price_per_liter;
                    if (e.fueling_date.startsWith(monthStr)) thisMonthCost += cost;
                    if (new Date(e.fueling_date) >= yearAgo) annualCost += cost;
                }
            }

            if (maintRes.ok) {
                const entries = await maintRes.json();
                for (const e of entries) {
                    if (e.maintenance_date.startsWith(monthStr)) thisMonthCost += e.cost;
                    if (new Date(e.maintenance_date) >= yearAgo) annualCost += e.cost;
                }
            }

            return { thisMonth: thisMonthCost, monthlyAverage: annualCost / 12 };
        } catch (e) {
            return { thisMonth: 0, monthlyAverage: 0 };
        }
    }

    renderVehicles(vehiclesToRender = this.vehicles) {
        if (vehiclesToRender.length === 0) {
            this.showNoVehicles();
            return;
        }

        this.vehiclesGrid.innerHTML = vehiclesToRender.map(vehicle =>
            this.vehicleCard.createVehicleCard(
                vehicle,
                this.vehicleStats.get(vehicle.id) || {},
                this.vehicleCostStats.get(vehicle.id) || null
            )
        ).join('');

        this.attachCardEventListeners();
    }

    attachCardEventListeners() {
        document.querySelectorAll('.fuel-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleAddFuelEntry(btn.dataset.vehicleId);
            });
        });

        document.querySelectorAll('.maintenance-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleViewMaintenances(btn.dataset.vehicleId);
            });
        });

        document.querySelectorAll('.stats-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleViewDetails(btn.dataset.vehicleId);
            });
        });

        document.querySelectorAll('.action-btn.view-fuel').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleViewFuelEntries(btn.dataset.vehicleId);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleDeleteVehicle(btn.dataset.vehicleId);
            });
        });
    }

    showLoading() {
        this.loadingSpinner.style.display = 'flex';
        this.vehiclesGrid.style.display = 'none';
        this.errorMessage.style.display = 'none';
        this.noVehiclesMessage.style.display = 'none';
    }

    hideLoading() {
        this.loadingSpinner.style.display = 'none';
        this.vehiclesGrid.style.display = 'grid';
    }

    showError() {
        this.loadingSpinner.style.display = 'none';
        this.vehiclesGrid.style.display = 'none';
        this.errorMessage.style.display = 'block';
        this.noVehiclesMessage.style.display = 'none';
    }

    showNoVehicles() {
        this.loadingSpinner.style.display = 'none';
        this.vehiclesGrid.style.display = 'none';
        this.errorMessage.style.display = 'none';
        this.noVehiclesMessage.style.display = 'block';
    }

    handleAddVehicle() { this.vehicleAdd.show(); }

    handleAddFuelEntry(vehicleId) {
        const vehicle = this.vehicles.find(v => v.id == vehicleId);
        this.fuelAdd.show(vehicle);
    }

    handleViewDetails(vehicleId) { this.vehicleDetails.show(vehicleId); }

    handleViewFuelEntries(vehicleId) { this.fuelView.show(vehicleId); }

    handleAddMaintenance(vehicleId) {
        const vehicle = this.vehicles.find(v => v.id == vehicleId);
        this.maintenanceAdd.show(vehicle);
    }

    handleViewMaintenances(vehicleId) { this.maintenanceView.show(vehicleId); }

    async handleDeleteVehicle(vehicleId) {
        const vehicle = this.vehicles.find(v => v.id == vehicleId);
        const vehicleName = vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.license_plate})` : `Véhicule #${vehicleId}`;

        if (!confirm(`Êtes-vous sûr de vouloir supprimer ${vehicleName} ?\n\nCette action supprimera également tous les pleins et maintenances associés.`)) return;

        try {
            const response = await fetch(`${this.baseURL}/vehicles/${vehicleId}?force=true`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Erreur lors de la suppression');
            this.loadVehicles();
        } catch (error) {
            console.error('Erreur:', error);
            alert('Erreur lors de la suppression du véhicule');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => { new Dashboard(); });

export default Dashboard;
