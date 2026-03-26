import { fetchApi } from '../config.js';

class VehicleDetails {
    constructor(baseURL, onVehicleEdited) {
        this.baseURL = baseURL;
        this.onVehicleEdited = onVehicleEdited;
        this.currentVehicle = null;
        this.vehicleStats = null;
        this.isEditing = false;
        this.createPopup();
        this.attachEventListeners();
    }

    createPopup() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'popup-overlay';
        this.overlay.id = 'vehicleDetailsPopup';

        this.overlay.innerHTML = `
            <div class="popup-container vehicle-details-popup">
                <div class="popup-header">
                    <h2 class="popup-title">Détails du véhicule</h2>
                    <button type="button" class="popup-close">&times;</button>
                </div>
                <div class="popup-body">
                    <div class="message" id="vehicleDetailsMessage"></div>
                    <div class="loading-spinner" id="vehicleDetailsLoading" style="display: none;">
                        <div class="spinner"></div>
                        <p>Chargement des détails...</p>
                    </div>
                    <div id="vehicleDetailsContent"></div>
                </div>
                <div class="popup-footer">
                    <button type="button" class="btn btn-secondary" id="closeDetailsBtn">Fermer</button>
                    <button type="button" class="btn btn-primary" id="editVehicleBtn">Modifier</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);
    }

    attachEventListeners() {
        this.closeBtn = this.overlay.querySelector('.popup-close');
        this.closeBtnFooter = document.getElementById('closeDetailsBtn');
        this.editBtn = document.getElementById('editVehicleBtn');
        this.messageDiv = document.getElementById('vehicleDetailsMessage');
        this.loadingDiv = document.getElementById('vehicleDetailsLoading');
        this.contentDiv = document.getElementById('vehicleDetailsContent');

        this.closeBtn.addEventListener('click', () => this.hide());
        this.closeBtnFooter.addEventListener('click', () => this.hide());
        this.editBtn.addEventListener('click', () => this.handleEdit());

        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.hide();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay.classList.contains('show') && !this.isEditing) {
                this.hide();
            }
        });
    }

    async show(vehicleId) {
        this.overlay.classList.add('show');
        this.hideMessage();
        this.showLoading();

        try {
            await this.loadVehicleDetails(vehicleId);
            await this.loadVehicleStats(vehicleId);
            this.renderVehicleDetails();
            this.hideLoading();
        } catch (error) {
            console.error('Erreur lors du chargement des détails:', error);
            this.showMessage('Erreur lors du chargement des détails du véhicule', 'error');
            this.hideLoading();
        }
    }

    hide() {
        this.overlay.classList.remove('show');
        this.currentVehicle = null;
        this.vehicleStats = null;
        this.hideMessage();
    }

    async loadVehicleDetails(vehicleId) {
        const response = await fetchApi(`${this.baseURL}/vehicles/${vehicleId}`);
        if (!response.ok) {
            throw new Error('Erreur lors du chargement du véhicule');
        }
        this.currentVehicle = await response.json();
    }

    async loadVehicleStats(vehicleId) {
        try {
            const response = await fetchApi(`${this.baseURL}/vehicles/${vehicleId}/stats`);
            if (response.ok) {
                this.vehicleStats = await response.json();
            }
        } catch (error) {
            console.warn('Impossible de charger les statistiques:', error);
        }
    }

    renderVehicleDetails() {
        if (!this.currentVehicle) return;

        const vehicle = this.currentVehicle;
        const stats = this.vehicleStats || {};

        // Update popup title with vehicle name
        const titleEl = this.overlay.querySelector('.popup-title');
        if (titleEl) titleEl.textContent = `${vehicle.brand} ${vehicle.model} - Détails`;

        this.contentDiv.innerHTML = `
            <div class="vehicle-details-grid">
                <div class="details-section">
                    <h3 class="section-title">
                        <i class="icon-car"></i>
                        Informations générales
                    </h3>
                    <div class="details-grid">
                        <div class="detail-item">
                            <label>Marque</label>
                            <span class="detail-value">${vehicle.brand || 'Non renseigné'}</span>
                        </div>
                        <div class="detail-item">
                            <label>Modèle</label>
                            <span class="detail-value">${vehicle.model || 'Non renseigné'}</span>
                        </div>
                        <div class="detail-item">
                            <label>Année</label>
                            <span class="detail-value">${vehicle.year || 'Non renseignée'}</span>
                        </div>
                        <div class="detail-item">
                            <label>Plaque d'immatriculation</label>
                            <span class="detail-value">${vehicle.license_plate || 'Non renseignée'}</span>
                        </div>
                        <div class="detail-item">
                            <label>Type de carburant</label>
                            <span class="detail-value fuel-type-badge fuel-${vehicle.fuel_type}">
                                ${this.getFuelTypeLabel(vehicle.fuel_type)}
                            </span>
                        </div>
                        <div class="detail-item">
                            <label>Statut</label>
                            <span class="detail-value status-badge ${vehicle.is_active ? 'active' : 'inactive'}">
                                ${vehicle.is_active ? 'Actif' : 'Inactif'}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="details-section">
                    <h3 class="section-title">
                        <i class="icon-settings"></i>
                        Informations techniques
                    </h3>
                    <div class="details-grid">
                        <div class="detail-item">
                            <label>Kilométrage initial</label>
                            <span class="detail-value">${this.formatNumber(vehicle.initial_odometer)} km</span>
                        </div>
                        <div class="detail-item">
                            <label>Capacité du réservoir</label>
                            <span class="detail-value">${vehicle.tank_capacity ? vehicle.tank_capacity + ' L' : 'Non renseignée'}</span>
                        </div>
                        <div class="detail-item">
                            <label>Kilométrage actuel</label>
                            <span class="detail-value">${stats.last_odometer ? this.formatNumber(stats.last_odometer) + ' km' : 'Aucun relevé'}</span>
                        </div>
                        <div class="detail-item">
                            <label>Distance parcourue</label>
                            <span class="detail-value">${stats.total_distance ? this.formatNumber(stats.total_distance) + ' km' : 'Aucune donnée'}</span>
                        </div>
                    </div>
                </div>

                <div class="details-section">
                    <h3 class="section-title">
                        <i class="icon-euro"></i>
                        Informations d'achat
                    </h3>
                    <div class="details-grid">
                        <div class="detail-item">
                            <label>Date d'acquisition</label>
                            <span class="detail-value">${vehicle.acquisition_date ? this.formatDate(vehicle.acquisition_date) : 'Non renseignée'}</span>
                        </div>
                        <div class="detail-item">
                            <label>Prix d'achat</label>
                            <span class="detail-value">${vehicle.purchase_price ? this.formatCurrency(vehicle.purchase_price) : 'Non renseigné'}</span>
                        </div>
                    </div>
                </div>

                ${this.renderInsuranceTracking(vehicle, stats)}
                ${this.renderFuelStats(stats)}

                ${vehicle.description ? `
                <div class="details-section">
                    <h3 class="section-title">
                        <i class="icon-info"></i>
                        Description
                    </h3>
                    <div class="description-content">
                        ${vehicle.description}
                    </div>
                </div>` : ''}

                <div class="details-section system-info">
                    <h3 class="section-title">
                        <i class="icon-clock"></i>
                        Informations système
                    </h3>
                    <div class="details-grid">
                        <div class="detail-item">
                            <label>Date de création</label>
                            <span class="detail-value">${this.formatDateTime(vehicle.created_at)}</span>
                        </div>
                        <div class="detail-item">
                            <label>Dernière modification</label>
                            <span class="detail-value">${vehicle.updated_at ? this.formatDateTime(vehicle.updated_at) : 'Jamais modifié'}</span>
                        </div>
                        <div class="detail-item">
                            <label>ID véhicule</label>
                            <span class="detail-value">#${vehicle.id}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderInsuranceTracking(vehicle, stats) {
        if (!vehicle.insurance_km_limit || !vehicle.insurance_km_start_date) {
            return '';
        }

        const statusClass = stats.insurance_km_exceeded ? 'status-exceeded' :
                          stats.insurance_km_remaining < (stats.current_insurance_km_limit * 0.1) ? 'status-warning' :
                          stats.insurance_km_remaining < (stats.current_insurance_km_limit * 0.25) ? 'status-caution' :
                          'status-ok';

        const statusIcon = stats.insurance_km_exceeded ? '⚠️' :
                         stats.insurance_km_remaining < (stats.current_insurance_km_limit * 0.1) ? '🔴' :
                         stats.insurance_km_remaining < (stats.current_insurance_km_limit * 0.25) ? '🟡' :
                         '🟢';

        const statusText = stats.insurance_km_exceeded ?
                         `Limite dépassée de ${this.formatNumber(Math.abs(stats.insurance_km_remaining))} km` :
                         `${this.formatNumber(stats.insurance_km_remaining)} km restants`;

        return `
            <div class="details-section insurance-section ${statusClass}">
                <h3 class="section-title">
                    <i class="icon-speedometer"></i>
                    Suivi assurance kilométrique
                </h3>
                <div class="insurance-status-banner ${statusClass}">
                    <span class="status-icon">${statusIcon}</span>
                    <span class="status-text">${statusText}</span>
                </div>
                <div class="details-grid">
                    <div class="detail-item">
                        <label>Limite kilométrique initiale</label>
                        <span class="detail-value">${this.formatNumber(vehicle.insurance_km_limit)} km</span>
                    </div>
                    <div class="detail-item">
                        <label>Augmentation annuelle</label>
                        <span class="detail-value">${vehicle.insurance_km_annual_increase ? this.formatNumber(vehicle.insurance_km_annual_increase) + ' km/an' : 'Non configurée'}</span>
                    </div>
                    <div class="detail-item">
                        <label>Date de début du suivi</label>
                        <span class="detail-value">${this.formatDate(vehicle.insurance_km_start_date)}</span>
                    </div>
                    <div class="detail-item">
                        <label>Limite kilométrique actuelle</label>
                        <span class="detail-value highlight">${this.formatNumber(stats.current_insurance_km_limit)} km</span>
                    </div>
                    <div class="detail-item">
                        <label>Kilométrage actuel</label>
                        <span class="detail-value">${stats.last_odometer ? this.formatNumber(stats.last_odometer) + ' km' : 'Aucun relevé'}</span>
                    </div>
                    <div class="detail-item">
                        <label>Kilomètres restants</label>
                        <span class="detail-value ${statusClass}">${this.formatNumber(stats.insurance_km_remaining)} km</span>
                    </div>
                </div>
            </div>
        `;
    }

    renderFuelStats(stats) {
        if (!stats || Object.keys(stats).length === 0) {
            return `
                <div class="details-section">
                    <h3 class="section-title">
                        <i class="icon-fuel"></i>
                        Statistiques carburant
                    </h3>
                    <div class="no-stats">
                        <p>Aucune donnée de carburant disponible</p>
                    </div>
                </div>
            `;
        }

        return `
            <div class="details-section">
                <h3 class="section-title">
                    <i class="icon-fuel"></i>
                    Statistiques carburant
                </h3>
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-value">${stats.total_fuel_entries || 0}</div>
                        <div class="stat-label">Plein(s) enregistré(s)</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.total_fuel_quantity ? stats.total_fuel_quantity.toFixed(1) + ' L' : '0 L'}</div>
                        <div class="stat-label">Carburant total</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.total_fuel_cost ? this.formatCurrency(stats.total_fuel_cost) : '0€'}</div>
                        <div class="stat-label">Coût total</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.average_consumption ? stats.average_consumption.toFixed(1) + ' L/100km' : 'N/A'}</div>
                        <div class="stat-label">Consommation moyenne</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.average_fuel_price ? stats.average_fuel_price.toFixed(3) + '€/L' : 'N/A'}</div>
                        <div class="stat-label">Prix moyen</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${stats.cost_per_km ? stats.cost_per_km.toFixed(1) + '€/km' : 'N/A'}</div>
                        <div class="stat-label">Coût par km</div>
                    </div>
                </div>
            </div>
        `;
    }

    // ===== EDIT VEHICLE (secondary overlay) =====

    handleEdit() {
        if (!this.currentVehicle) return;

        this.isEditing = true;
        const vehicle = this.currentVehicle;

        const editOverlay = document.createElement('div');
        editOverlay.className = 'popup-overlay edit-fuel-overlay';
        editOverlay.id = 'editVehiclePopup';

        editOverlay.innerHTML = `
            <div class="popup-container">
                <div class="popup-header">
                    <h2 class="popup-title">Modifier le véhicule</h2>
                    <button type="button" class="popup-close">&times;</button>
                </div>
                <div class="popup-body">
                    <div class="message" id="editVehicleMessage"></div>
                    <form class="popup-form" id="editVehicleForm">
                        <div class="form-group">
                            <label for="edit_v_brand">Marque *</label>
                            <input type="text" id="edit_v_brand" name="brand" required>
                        </div>
                        <div class="form-group">
                            <label for="edit_v_model">Modèle *</label>
                            <input type="text" id="edit_v_model" name="model" required>
                        </div>
                        <div class="form-group">
                            <label for="edit_v_year">Année</label>
                            <input type="number" id="edit_v_year" name="year" min="1900" max="2030">
                        </div>
                        <div class="form-group">
                            <label for="edit_v_fuel_type">Type de carburant *</label>
                            <select id="edit_v_fuel_type" name="fuel_type" required>
                                <option value="">Sélectionner...</option>
                                <option value="essence">Essence</option>
                                <option value="diesel">Diesel</option>
                                <option value="electrique">Électrique</option>
                                <option value="hybride">Hybride</option>
                                <option value="gpl">GPL</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="edit_v_license_plate">Plaque d'immatriculation</label>
                            <input type="text" id="edit_v_license_plate" name="license_plate" style="text-transform: uppercase;">
                        </div>
                        <div class="form-group">
                            <label for="edit_v_fuel_capacity">Capacité du réservoir (L)</label>
                            <input type="number" id="edit_v_fuel_capacity" name="fuel_capacity" min="0" step="0.1">
                        </div>
                        <div class="form-group">
                            <label for="edit_v_engine_power">Puissance moteur (CV)</label>
                            <input type="number" id="edit_v_engine_power" name="engine_power" min="0">
                        </div>
                        <div class="form-group">
                            <label for="edit_v_purchase_date">Date d'achat</label>
                            <input type="date" id="edit_v_purchase_date" name="purchase_date">
                        </div>
                        <div class="form-group">
                            <label for="edit_v_purchase_price">Prix d'achat (€)</label>
                            <input type="number" id="edit_v_purchase_price" name="purchase_price" min="0" step="0.01">
                        </div>

                        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
                        <h3 style="margin-bottom: 15px; font-size: 1.1em;">Suivi assurance kilométrique</h3>

                        <div class="form-group">
                            <label for="edit_v_insurance_km_limit">Limite kilométrique initiale (km)</label>
                            <input type="number" id="edit_v_insurance_km_limit" name="insurance_km_limit" min="0" placeholder="Ex: 60000">
                        </div>
                        <div class="form-group">
                            <label for="edit_v_insurance_km_annual_increase">Augmentation annuelle (km)</label>
                            <input type="number" id="edit_v_insurance_km_annual_increase" name="insurance_km_annual_increase" min="0" placeholder="Ex: 20000">
                        </div>
                        <div class="form-group">
                            <label for="edit_v_insurance_km_start_date">Date de début du suivi</label>
                            <input type="date" id="edit_v_insurance_km_start_date" name="insurance_km_start_date">
                        </div>
                        <div class="form-group">
                            <label for="edit_v_notes">Notes personnelles</label>
                            <textarea id="edit_v_notes" name="notes" rows="3" placeholder="Notes, commentaires ou informations supplémentaires..."></textarea>
                        </div>
                    </form>
                </div>
                <div class="popup-footer">
                    <button type="button" class="btn btn-secondary" id="cancelEditVehicleBtn">Annuler</button>
                    <button type="submit" class="btn btn-primary" form="editVehicleForm" id="submitEditVehicleBtn">Modifier</button>
                </div>
            </div>
        `;

        document.body.appendChild(editOverlay);
        setTimeout(() => editOverlay.classList.add('show'), 10);

        this.populateEditForm(vehicle);
        this.attachEditFormEvents(editOverlay);
    }

    populateEditForm(vehicle) {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el && val !== null && val !== undefined) el.value = val;
        };

        setVal('edit_v_brand', vehicle.brand);
        setVal('edit_v_model', vehicle.model);
        setVal('edit_v_year', vehicle.year);
        setVal('edit_v_fuel_type', vehicle.fuel_type);
        setVal('edit_v_license_plate', vehicle.license_plate);
        setVal('edit_v_fuel_capacity', vehicle.fuel_capacity || vehicle.tank_capacity);
        setVal('edit_v_engine_power', vehicle.engine_power);
        setVal('edit_v_notes', vehicle.notes || vehicle.description);
        setVal('edit_v_purchase_price', vehicle.purchase_price);

        if (vehicle.purchase_date || vehicle.acquisition_date) {
            const dateStr = vehicle.purchase_date || vehicle.acquisition_date;
            setVal('edit_v_purchase_date', new Date(dateStr).toISOString().split('T')[0]);
        }

        setVal('edit_v_insurance_km_limit', vehicle.insurance_km_limit);
        setVal('edit_v_insurance_km_annual_increase', vehicle.insurance_km_annual_increase);

        if (vehicle.insurance_km_start_date) {
            setVal('edit_v_insurance_km_start_date', new Date(vehicle.insurance_km_start_date).toISOString().split('T')[0]);
        }
    }

    attachEditFormEvents(editOverlay) {
        const form = document.getElementById('editVehicleForm');
        const closeBtn = editOverlay.querySelector('.popup-close');
        const cancelBtn = document.getElementById('cancelEditVehicleBtn');

        const closeEdit = () => {
            this.isEditing = false;
            editOverlay.classList.remove('show');
            editOverlay.classList.add('hiding');
            setTimeout(() => editOverlay.remove(), 300);
        };

        closeBtn.addEventListener('click', closeEdit);
        cancelBtn.addEventListener('click', closeEdit);

        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                e.stopImmediatePropagation();
                closeEdit();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);

        // License plate auto-uppercase
        const lpInput = document.getElementById('edit_v_license_plate');
        if (lpInput) {
            lpInput.addEventListener('input', (e) => e.target.value = e.target.value.toUpperCase());
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleEditSubmit(editOverlay);
        });
    }

    async handleEditSubmit(editOverlay) {
        const messageDiv = document.getElementById('editVehicleMessage');
        const submitBtn = document.getElementById('submitEditVehicleBtn');
        const cancelBtn = document.getElementById('cancelEditVehicleBtn');

        try {
            if (messageDiv) {
                messageDiv.textContent = 'Modification en cours...';
                messageDiv.className = 'message info';
                messageDiv.style.display = 'block';
            }
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Modification...'; }
            if (cancelBtn) cancelBtn.disabled = true;

            const formData = new FormData(document.getElementById('editVehicleForm'));
            const vehicleData = {};

            for (let [key, value] of formData.entries()) {
                if (value.trim() !== '') {
                    if (['year', 'engine_power'].includes(key)) {
                        vehicleData[key] = parseInt(value);
                    } else if (['fuel_capacity', 'purchase_price', 'insurance_km_limit', 'insurance_km_annual_increase'].includes(key)) {
                        vehicleData[key] = parseFloat(value);
                    } else {
                        vehicleData[key] = value;
                    }
                }
            }

            // Validation
            if (!vehicleData.brand || vehicleData.brand.length < 2) {
                if (messageDiv) { messageDiv.textContent = 'La marque doit contenir au moins 2 caractères'; messageDiv.className = 'message error'; }
                return;
            }
            if (!vehicleData.model || vehicleData.model.length < 1) {
                if (messageDiv) { messageDiv.textContent = 'Le modèle est requis'; messageDiv.className = 'message error'; }
                return;
            }

            const response = await fetchApi(`${this.baseURL}/vehicles/${this.currentVehicle.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(vehicleData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Erreur lors de la modification');
            }

            const updatedVehicle = await response.json();

            if (messageDiv) {
                messageDiv.textContent = 'Véhicule modifié avec succès !';
                messageDiv.className = 'message success';
            }

            this.currentVehicle = updatedVehicle;

            // Reload stats then close edit overlay
            await this.loadVehicleStats(updatedVehicle.id);

            setTimeout(() => {
                this.isEditing = false;
                editOverlay.classList.remove('show');
                editOverlay.classList.add('hiding');
                setTimeout(() => {
                    editOverlay.remove();
                    this.renderVehicleDetails();
                    if (this.onVehicleEdited) this.onVehicleEdited();
                }, 300);
            }, 1500);

        } catch (error) {
            console.error('Erreur:', error);
            if (messageDiv) {
                messageDiv.textContent = error.message;
                messageDiv.className = 'message error';
                messageDiv.style.display = 'block';
            }
        } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Modifier'; }
            if (cancelBtn) cancelBtn.disabled = false;
        }
    }

    // ===== UTILITIES =====

    getFuelTypeLabel(fuelType) {
        const labels = {
            'essence': 'Essence', 'diesel': 'Diesel',
            'electrique': 'Électrique', 'hybride': 'Hybride', 'gpl': 'GPL'
        };
        return labels[fuelType] || fuelType;
    }

    formatNumber(number) {
        return new Intl.NumberFormat('fr-FR').format(number);
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('fr-FR');
    }

    formatDateTime(dateString) {
        return new Date(dateString).toLocaleDateString('fr-FR', {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    showLoading() {
        this.loadingDiv.style.display = 'flex';
        this.contentDiv.style.display = 'none';
    }

    hideLoading() {
        this.loadingDiv.style.display = 'none';
        this.contentDiv.style.display = 'block';
    }

    showMessage(text, type) {
        this.messageDiv.textContent = text;
        this.messageDiv.className = `message show ${type}`;
    }

    hideMessage() {
        this.messageDiv.className = 'message';
    }
}

export default VehicleDetails;
