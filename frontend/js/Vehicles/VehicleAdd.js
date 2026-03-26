import { fetchApi } from '../config.js';

class VehicleAdd {
    constructor(baseURL, onVehicleAdded) {
        this.baseURL = baseURL;
        this.onVehicleAdded = onVehicleAdded;
        this.createPopup();
        this.attachEventListeners();
    }

    createPopup() {
        // Créer l'overlay du popup
        this.overlay = document.createElement('div');
        this.overlay.className = 'popup-overlay';
        this.overlay.id = 'vehicleAddPopup';
        
        this.overlay.innerHTML = `
            <div class="popup-container">
                <div class="popup-header">
                    <h2 class="popup-title">Ajouter un véhicule</h2>
                    <button type="button" class="popup-close">&times;</button>
                </div>
                <div class="popup-body">
                    <div class="message" id="vehicleMessage"></div>
                    <form class="popup-form" id="vehicleAddForm">
                        <div class="form-group">
                            <label for="brand">Marque *</label>
                            <input type="text" id="brand" name="brand" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="model">Modèle *</label>
                            <input type="text" id="model" name="model" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="year">Année</label>
                            <input type="number" id="year" name="year" min="1900" max="2030">
                        </div>
                        
                        <div class="form-group">
                            <label for="fuel_type">Type de carburant *</label>
                            <select id="fuel_type" name="fuel_type" required>
                                <option value="">Sélectionner...</option>
                                <option value="essence">Essence</option>
                                <option value="diesel">Diesel</option>
                                <option value="electrique">Électrique</option>
                                <option value="hybride">Hybride</option>
                                <option value="gpl">GPL</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label for="license_plate">Plaque d'immatriculation</label>
                            <input type="text" id="license_plate" name="license_plate">
                        </div>
                        
                        <div class="form-group">
                            <label for="initial_odometer">Kilométrage initial</label>
                            <input type="number" id="initial_odometer" name="initial_odometer" min="0">
                        </div>

                        <div class="form-group">
                            <label for="tank_capacity">Capacité en carburant (L)</label>
                            <input type="number" id="tank_capacity" name="tank_capacity" min="0">
                        </div>

                        <div class="form-group">
                            <label for="acquisition_date">Date d'acquisition</label>
                            <input type="date" id="acquisition_date" name="acquisition_date" >
                        </div>

                        <div class="form-group">
                            <label for="purchase_price">Prix d'achat </label>
                            <input type="number" id="purchase_price" name="purchase_price" min="0">
                        </div>

                        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
                        <h3 style="margin-bottom: 15px; font-size: 1.1em;">Suivi assurance kilométrique</h3>

                        <div class="form-group">
                            <label for="insurance_km_limit">Limite kilométrique initiale (km)</label>
                            <input type="number" id="insurance_km_limit" name="insurance_km_limit" min="0" placeholder="Ex: 60000">
                        </div>

                        <div class="form-group">
                            <label for="insurance_km_annual_increase">Augmentation annuelle (km)</label>
                            <input type="number" id="insurance_km_annual_increase" name="insurance_km_annual_increase" min="0" placeholder="Ex: 20000">
                        </div>

                        <div class="form-group">
                            <label for="insurance_km_start_date">Date de début du suivi</label>
                            <input type="date" id="insurance_km_start_date" name="insurance_km_start_date">
                        </div>
                    </form>
                </div>
                <div class="popup-footer">
                    <button type="button" class="btn btn-secondary" id="cancelVehicleBtn">Annuler</button>
                    <button type="submit" class="btn btn-primary" form="vehicleAddForm">Ajouter</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);
    }

    attachEventListeners() {
        this.form = document.getElementById('vehicleAddForm');
        this.closeBtn = this.overlay.querySelector('.popup-close');
        this.cancelBtn = document.getElementById('cancelVehicleBtn');
        this.messageDiv = document.getElementById('vehicleMessage');

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

    show() {
        this.overlay.classList.add('show');
        this.form.reset();
        this.hideMessage();
        
        // Focus sur le premier champ
        const firstInput = this.form.querySelector('input');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    }

    hide() {
        this.overlay.classList.remove('show');
        this.form.reset();
        this.hideMessage();
    }

    async handleSubmit(e) {
        e.preventDefault();

        const formData = new FormData(this.form);
        const vehicleData = {
            brand: formData.get('brand'),
            model: formData.get('model'),
            year: formData.get('year') ? parseInt(formData.get('year')) : null,
            fuel_type: formData.get('fuel_type'),
            license_plate: formData.get('license_plate') || null,
            tank_capacity: formData.get('tank_capacity') || null,
            acquisition_date: formData.get('acquisition_date') || null,
            purchase_price: formData.get('purchase_price') || null,
            initial_odometer: formData.get('initial_odometer') ? parseInt(formData.get('initial_odometer')) : 0,
            insurance_km_limit: formData.get('insurance_km_limit') ? parseFloat(formData.get('insurance_km_limit')) : null,
            insurance_km_annual_increase: formData.get('insurance_km_annual_increase') ? parseFloat(formData.get('insurance_km_annual_increase')) : null,
            insurance_km_start_date: formData.get('insurance_km_start_date') || null
        };

        try {
            const response = await fetchApi(`${this.baseURL}/vehicles/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(vehicleData)
            });

            if (!response.ok) {
                throw new Error('Erreur lors de l\'ajout du véhicule');
            }

            this.showMessage('Véhicule ajouté avec succès !', 'success');
            setTimeout(() => {
                this.hide();
                this.onVehicleAdded();
            }, 1500);

        } catch (error) {
            console.error('Erreur:', error);
            this.showMessage('Erreur lors de l\'ajout du véhicule', 'error');
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
export default VehicleAdd;