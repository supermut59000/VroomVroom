import { fetchApi } from '../config.js';

class MaintenanceAdd {
    constructor(baseURL, onMaintenanceAdded) {
        this.baseURL = baseURL;
        this.onMaintenanceAdded = onMaintenanceAdded;
        this.currentVehicle = null;
        this.createPopup();
        this.attachEventListeners();
    }

    createPopup() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'popup-overlay';
        this.overlay.id = 'maintenanceAddPopup';

        this.overlay.innerHTML = `
            <div class="popup-container">
                <div class="popup-header">
                    <h2 class="popup-title">Ajouter une maintenance</h2>
                    <button type="button" class="popup-close">&times;</button>
                </div>
                <div class="popup-body">
                    <div class="message" id="maintenanceMessage"></div>
                    <div id="vehicleInfo" class="vehicle-info"></div>
                    <form class="popup-form" id="maintenanceAddForm">
                        <div class="form-group">
                            <label for="maintenance_date">Date *</label>
                            <input type="date" id="maintenance_date" name="date" required>
                        </div>

                        <div class="form-group">
                            <label for="maintenance_type">Type de maintenance *</label>
                            <select id="maintenance_type" name="maintenance_type" required>
                                <option value="">Sélectionner un type</option>
                                <option value="vidange">Vidange</option>
                                <option value="rotation_pneus">Rotation des pneus</option>
                                <option value="freins">Freins</option>
                                <option value="changement_pneus">Changement de pneus</option>
                                <option value="batterie">Batterie</option>
                                <option value="filtre_air">Filtre à air</option>
                                <option value="bougies">Bougies</option>
                                <option value="courroie_distribution">Courroie de distribution</option>
                                <option value="controle_technique">Contrôle technique</option>
                                <option value="autre">Autre</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="description">Description</label>
                            <textarea id="description" name="description" rows="2" placeholder="Détails de l'intervention..."></textarea>
                        </div>

                        <div class="form-group">
                            <label for="odometer">Kilométrage *</label>
                            <input type="number" id="odometer" name="odometer" min="0" required>
                        </div>

                        <div class="form-group">
                            <label for="cost">Coût (€) *</label>
                            <input type="number" id="cost" name="cost" step="0.01" min="0" required>
                        </div>

                        <div class="form-group">
                            <label for="service_provider">Prestataire</label>
                            <input type="text" id="service_provider" name="service_provider" placeholder="Ex: Garage Renault">
                        </div>

                        <div class="form-group">
                            <label for="location">Localisation</label>
                            <input type="text" id="location" name="location" placeholder="Ex: Paris, France">
                        </div>

                        <div class="form-group">
                            <label for="notes">Notes</label>
                            <textarea id="notes" name="notes" rows="3" placeholder="Notes supplémentaires..."></textarea>
                        </div>

                        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">

                        <h3 style="font-size: 16px; margin-bottom: 15px; color: #333;">Prochaine maintenance (optionnel)</h3>

                        <div class="form-group">
                            <label for="next_maintenance_date">Prochaine date</label>
                            <input type="date" id="next_maintenance_date" name="next_maintenance_date">
                        </div>

                        <div class="form-group">
                            <label for="next_maintenance_odometer">Prochain kilométrage</label>
                            <input type="number" id="next_maintenance_odometer" name="next_maintenance_odometer" min="0" placeholder="Ex: 135000">
                        </div>
                    </form>
                </div>
                <div class="popup-footer">
                    <button type="button" class="btn btn-secondary" id="cancelMaintenanceBtn">Annuler</button>
                    <button type="submit" class="btn btn-primary" form="maintenanceAddForm">Ajouter</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);
    }

    attachEventListeners() {
        this.form = document.getElementById('maintenanceAddForm');
        this.closeBtn = this.overlay.querySelector('.popup-close');
        this.cancelBtn = document.getElementById('cancelMaintenanceBtn');
        this.messageDiv = document.getElementById('maintenanceMessage');
        this.vehicleInfoDiv = document.getElementById('vehicleInfo');

        // Fermer le popup
        this.closeBtn.addEventListener('click', () => this.hide());
        this.cancelBtn.addEventListener('click', () => this.hide());

        // Fermer en cliquant sur l'overlay
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.hide();
            }
        });

        // Fermer avec Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay.classList.contains('show')) {
                this.hide();
            }
        });

        // Soumettre le formulaire
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    show(vehicle) {
        this.currentVehicle = vehicle;
        this.displayVehicleInfo();
        this.overlay.classList.add('show');
        this.form.reset();
        this.hideMessage();

        // Définir la date par défaut à aujourd'hui
        document.getElementById('maintenance_date').value = new Date().toISOString().split('T')[0];

        // Focus sur le premier champ
        setTimeout(() => document.getElementById('maintenance_date').focus(), 100);
    }

    hide() {
        this.overlay.classList.remove('show');
        this.form.reset();
        this.hideMessage();
        this.currentVehicle = null;
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

    async handleSubmit(e) {
        e.preventDefault();

        if (!this.currentVehicle) {
            this.showMessage('Aucun véhicule sélectionné', 'error');
            return;
        }

        const formData = new FormData(this.form);
        const maintenanceData = {
            vehicle_id: this.currentVehicle.id,
            maintenance_type: formData.get('maintenance_type'),
            description: formData.get('description') || null,
            maintenance_date: formData.get('date'),
            odometer_reading: parseInt(formData.get('odometer')),
            cost: parseFloat(formData.get('cost')),
            service_provider: formData.get('service_provider') || null,
            location: formData.get('location') || null,
            notes: formData.get('notes') || null,
            next_maintenance_date: formData.get('next_maintenance_date') || null,
            next_maintenance_odometer: formData.get('next_maintenance_odometer') ? parseInt(formData.get('next_maintenance_odometer')) : null
        };

        try {
            const response = await fetchApi(`${this.baseURL}/maintenances/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(maintenanceData)
            });

            if (!response.ok) {
                throw new Error('Erreur lors de l\'ajout de la maintenance');
            }

            this.showMessage('Maintenance ajoutée avec succès !', 'success');
            setTimeout(() => {
                this.hide();
                this.onMaintenanceAdded();
            }, 1500);

        } catch (error) {
            console.error('Erreur:', error);
            this.showMessage('Erreur lors de l\'ajout de la maintenance', 'error');
        }
    }

    showMessage(text, type) {
        this.messageDiv.textContent = text;
        this.messageDiv.className = `message show ${type}`;
    }

    hideMessage() {
        this.messageDiv.className = 'message';
    }
}
export default MaintenanceAdd;
