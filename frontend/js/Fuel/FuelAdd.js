import { fetchApi } from '../config.js';

class FuelAdd {
    constructor(baseURL, onFuelAdded) {
        this.baseURL = baseURL;
        this.onFuelAdded = onFuelAdded;
        this.currentVehicle = null;
        this.latestEntry = null;
        this.createPopup();
        this.attachEventListeners();
    }

    createPopup() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'popup-overlay';
        this.overlay.id = 'fuelAddPopup';

        this.overlay.innerHTML = `
            <div class="popup-container">
                <div class="popup-header">
                    <h2 class="popup-title">Ajouter un plein</h2>
                    <button type="button" class="popup-close">&times;</button>
                </div>
                <div class="popup-body">
                    <div class="message" id="fuelMessage"></div>
                    <div id="vehicleInfo" class="vehicle-info"></div>
                    <form class="popup-form" id="fuelAddForm">
                        <div class="form-group">
                            <label for="fuel_date">Date *</label>
                            <input type="date" id="fuel_date" name="date" required>
                        </div>

                        <div class="form-group">
                            <label for="odometer">Kilométrage *</label>
                            <input type="number" id="odometer" name="odometer" min="0" required>
                        </div>

                        <div class="form-group">
                            <label for="fuel_quantity">Quantité (L) *</label>
                            <input type="number" id="fuel_quantity" name="fuel_quantity" step="0.01" min="0" required>
                        </div>

                        <div class="form-group">
                            <label for="fuel_price_per_liter">Prix par litre (€) *</label>
                            <input type="number" id="fuel_price_per_liter" name="fuel_price_per_liter" step="0.001" min="0" required>
                        </div>

                        <div class="form-group">
                            <label for="total_cost">Coût total (€)</label>
                            <input type="number" id="total_cost" name="total_cost" step="0.01" readonly>
                        </div>

                        <div class="form-group form-group-checkbox">
                            <label for="is_full_tank" class="checkbox-label">
                                <input type="checkbox" id="is_full_tank" name="is_full_tank" checked>
                                <span>Plein complet</span>
                            </label>
                        </div>

                        <div class="form-group">
                            <label for="station_name">Station service</label>
                            <input type="text" id="station_name" name="station_name" list="stationSuggestions" autocomplete="off">
                            <datalist id="stationSuggestions"></datalist>
                        </div>

                        <div class="form-group">
                            <label for="location">Localisation</label>
                            <div class="input-with-btn">
                                <input type="text" id="location" name="location">
                                <button type="button" class="btn-gps" id="gpsBtn" title="Capturer ma position GPS">📍</button>
                            </div>
                            <span id="gpsStatus" class="gps-status"></span>
                            <input type="hidden" id="fuel_latitude" name="fuel_latitude">
                            <input type="hidden" id="fuel_longitude" name="fuel_longitude">
                        </div>

                        <div class="form-group">
                            <label for="notes">Notes</label>
                            <textarea id="notes" name="notes" rows="3"></textarea>
                        </div>
                    </form>
                </div>
                <div class="popup-footer">
                    <button type="button" class="btn btn-secondary" id="cancelFuelBtn">Annuler</button>
                    <button type="submit" class="btn btn-primary" form="fuelAddForm">Ajouter</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);
    }

    attachEventListeners() {
        this.form = document.getElementById('fuelAddForm');
        this.closeBtn = this.overlay.querySelector('.popup-close');
        this.cancelBtn = document.getElementById('cancelFuelBtn');
        this.messageDiv = document.getElementById('fuelMessage');
        this.vehicleInfoDiv = document.getElementById('vehicleInfo');

        this.quantityInput = document.getElementById('fuel_quantity');
        this.pricePerLiterInput = document.getElementById('fuel_price_per_liter');
        this.totalCostInput = document.getElementById('total_cost');

        this.closeBtn.addEventListener('click', () => this.hide());
        this.cancelBtn.addEventListener('click', () => this.hide());

        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.hide();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay.classList.contains('show')) this.hide();
        });

        this.quantityInput.addEventListener('input', () => this.calculateTotalCost());
        this.pricePerLiterInput.addEventListener('input', () => this.calculateTotalCost());

        document.getElementById('gpsBtn').addEventListener('click', () => this.captureGPS());

        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    async show(vehicle) {
        this.currentVehicle = vehicle;
        this.latestEntry = null;
        this.displayVehicleInfo();
        this.overlay.classList.add('show');
        this.form.reset();
        this.hideMessage();
        document.getElementById('gpsStatus').textContent = '';
        document.getElementById('fuel_date').value = new Date().toISOString().split('T')[0];

        // Load station suggestions and latest entry in parallel
        await Promise.all([
            this.loadStationSuggestions(vehicle.id),
            this.loadLatestEntry(vehicle.id)
        ]);

        setTimeout(() => document.getElementById('fuel_date').focus(), 100);
    }

    async loadStationSuggestions(vehicleId) {
        try {
            const response = await fetchApi(`${this.baseURL}/fuel-entries/stations?vehicle_id=${vehicleId}`);
            if (!response.ok) return;
            const stations = await response.json();
            const datalist = document.getElementById('stationSuggestions');
            datalist.innerHTML = stations.map(s => `<option value="${s}">`).join('');
        } catch (e) {
            // non-critical
        }
    }

    async loadLatestEntry(vehicleId) {
        try {
            const response = await fetchApi(`${this.baseURL}/fuel-entries/vehicle/${vehicleId}/latest`);
            if (!response.ok) return;
            this.latestEntry = await response.json();
            // Show last odometer as placeholder hint
            const odoInput = document.getElementById('odometer');
            if (odoInput && this.latestEntry?.odometer_reading) {
                odoInput.placeholder = `Dernier: ${this.latestEntry.odometer_reading.toLocaleString('fr-FR')} km`;
            }
        } catch (e) {
            // non-critical
        }
    }

    captureGPS() {
        if (!navigator.geolocation) {
            document.getElementById('gpsStatus').textContent = 'GPS non supporté par ce navigateur';
            return;
        }
        const btn = document.getElementById('gpsBtn');
        const status = document.getElementById('gpsStatus');
        btn.disabled = true;
        status.textContent = 'Localisation en cours…';

        navigator.geolocation.getCurrentPosition(
            (position) => {
                document.getElementById('fuel_latitude').value = position.coords.latitude;
                document.getElementById('fuel_longitude').value = position.coords.longitude;
                status.textContent = `✓ Position capturée (${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)})`;
                status.style.color = 'var(--success-color, #28a745)';
                btn.disabled = false;
            },
            () => {
                status.textContent = 'Impossible d\'obtenir la position';
                status.style.color = 'var(--danger-color, #dc3545)';
                btn.disabled = false;
            },
            { timeout: 10000, maximumAge: 60000 }
        );
    }

    hide() {
        this.overlay.classList.remove('show');
        this.form.reset();
        this.hideMessage();
        document.getElementById('gpsStatus').textContent = '';
        this.currentVehicle = null;
        this.latestEntry = null;
    }

    displayVehicleInfo() {
        if (this.currentVehicle) {
            this.vehicleInfoDiv.innerHTML = `
                <div style="background-color: #f8f9fa; padding: 10px; border-radius: 4px; margin-bottom: 15px;">
                    <strong>${this.currentVehicle.brand} ${this.currentVehicle.model}</strong>
                    ${this.currentVehicle.year ? ` (${this.currentVehicle.year})` : ''}
                    ${this.currentVehicle.license_plate ? ` - ${this.currentVehicle.license_plate}` : ''}
                </div>
            `;
        }
    }

    calculateTotalCost() {
        const quantity = parseFloat(this.quantityInput.value) || 0;
        const pricePerLiter = parseFloat(this.pricePerLiterInput.value) || 0;
        this.totalCostInput.value = (quantity * pricePerLiter).toFixed(2);
    }

    async handleSubmit(e) {
        e.preventDefault();

        if (!this.currentVehicle) {
            this.showMessage('Aucun véhicule sélectionné', 'error');
            return;
        }

        const formData = new FormData(this.form);
        const newOdo = parseInt(formData.get('odometer'));

        // Duplicate / backwards odometer check
        if (this.latestEntry) {
            if (newOdo === this.latestEntry.odometer_reading) {
                this.showMessage(
                    `⚠️ Ce kilométrage (${newOdo.toLocaleString('fr-FR')} km) est identique au dernier plein enregistré — doublon probable.`,
                    'error'
                );
                return;
            }
            if (newOdo < this.latestEntry.odometer_reading) {
                const ok = confirm(
                    `⚠️ Le kilométrage saisi (${newOdo.toLocaleString('fr-FR')} km) est inférieur au dernier enregistré (${this.latestEntry.odometer_reading.toLocaleString('fr-FR')} km).\n\nContinuer quand même ?`
                );
                if (!ok) return;
            }
        }

        const latVal = document.getElementById('fuel_latitude').value;
        const lngVal = document.getElementById('fuel_longitude').value;

        const fuelData = {
            vehicle_id: this.currentVehicle.id,
            fuel_type: this.currentVehicle.fuel_type,
            fueling_date: formData.get('date'),
            odometer_reading: newOdo,
            liters: parseFloat(formData.get('fuel_quantity')),
            price_per_liter: parseFloat(formData.get('fuel_price_per_liter')),
            total_cost: parseFloat(formData.get('total_cost')),
            is_full_tank: document.getElementById('is_full_tank').checked,
            location: formData.get('location') || null,
            station_name: formData.get('station_name') || null,
            notes: formData.get('notes') || null,
            latitude: latVal ? parseFloat(latVal) : null,
            longitude: lngVal ? parseFloat(lngVal) : null
        };

        try {
            const response = await fetchApi(`${this.baseURL}/fuel-entries/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fuelData)
            });

            if (!response.ok) throw new Error('api_error');

            this.showMessage('Plein ajouté avec succès !', 'success');
            setTimeout(() => { this.hide(); this.onFuelAdded(); }, 1500);

        } catch (error) {
            if (!navigator.onLine) {
                this.saveToOfflineQueue(fuelData);
                this.showMessage('Hors-ligne — plein enregistré localement, synchronisation automatique à la reconnexion.', 'success');
                setTimeout(() => { this.hide(); this.onFuelAdded(); }, 2500);
            } else {
                console.error('Erreur:', error);
                this.showMessage('Erreur lors de l\'ajout du plein', 'error');
            }
        }
    }

    saveToOfflineQueue(fuelData) {
        const queue = JSON.parse(localStorage.getItem('vv_offline_queue') || '[]');
        queue.push({ id: Date.now(), data: fuelData });
        localStorage.setItem('vv_offline_queue', JSON.stringify(queue));
    }

    showMessage(text, type) {
        this.messageDiv.textContent = text;
        this.messageDiv.className = `message show ${type}`;
    }

    hideMessage() {
        this.messageDiv.className = 'message';
    }
}
export default FuelAdd;
