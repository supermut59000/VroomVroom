class VehicleModif {
    constructor(baseURL, onVehicleModified) {
        this.baseURL = baseURL;
        this.onVehicleModified = onVehicleModified;
        this.currentVehicle = null;
        this.isVisible = false;
        this.overlay = null;
        
        this.initializeGlobalEventListeners();
    }

    initializeGlobalEventListeners() {
        // Event listener pour fermer le popup avec Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });

        // Event listener pour fermer en cliquant sur l'overlay
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('popup-overlay') && this.isVisible) {
                this.hide();
            }
        });
    }

    // Méthode principale pour afficher le popup
    async show(vehicleId) {
        try {
            this.showLoadingMessage('Chargement des données du véhicule...');
            
            const response = await fetch(`${this.baseURL}/vehicles/${vehicleId}`);
            if (!response.ok) {
                throw new Error('Erreur lors du chargement du véhicule');
            }

            const vehicle = await response.json();
            this.currentVehicle = vehicle;
            this.createPopup();
            this.populateForm(vehicle);
            this.attachEventListeners();
            this.overlay.classList.add('show');
            this.isVisible = true;
            
        } catch (error) {
            console.error('Erreur:', error);
            this.showNotification('Erreur lors du chargement du véhicule', 'error');
        }
    }

    // Créer le popup de modification
    createPopup() {
        // Supprimer le popup existant s'il y en a un
        this.removeExistingPopup();

        // Créer l'overlay du popup
        this.overlay = document.createElement('div');
        this.overlay.className = 'popup-overlay';
        this.overlay.id = 'vehicleModifPopup';
        
        this.overlay.innerHTML = `
            <div class="popup-container">
                <div class="popup-header">
                    <h2 class="popup-title">Modifier le véhicule</h2>
                    <button type="button" class="popup-close">&times;</button>
                </div>
                <div class="popup-body">
                    <div class="message" id="vehicleModifMessage"></div>
                    <form class="popup-form" id="vehicleModifForm">
                        <div class="form-group">
                            <label for="modif_brand">Marque *</label>
                            <input type="text" id="modif_brand" name="brand" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="modif_model">Modèle *</label>
                            <input type="text" id="modif_model" name="model" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="modif_year">Année</label>
                            <input type="number" id="modif_year" name="year" min="1900" max="2030">
                        </div>
                        
                        <div class="form-group">
                            <label for="modif_fuel_type">Type de carburant *</label>
                            <select id="modif_fuel_type" name="fuel_type" required>
                                <option value="">Sélectionner...</option>
                                <option value="essence">Essence</option>
                                <option value="diesel">Diesel</option>
                                <option value="electrique">Électrique</option>
                                <option value="hybride">Hybride</option>
                                <option value="gpl">GPL</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label for="modif_license_plate">Plaque d'immatriculation</label>
                            <input type="text" id="modif_license_plate" name="license_plate" style="text-transform: uppercase;">
                        </div>
                        
                        <div class="form-group">
                            <label for="modif_mileage">Kilométrage actuel (km)</label>
                            <input type="number" id="modif_mileage" name="mileage" min="0">
                        </div>

                        <div class="form-group">
                            <label for="modif_fuel_capacity">Capacité du réservoir (L)</label>
                            <input type="number" id="modif_fuel_capacity" name="fuel_capacity" min="0" step="0.1">
                        </div>

                        <div class="form-group">
                            <label for="modif_engine_power">Puissance moteur (CV)</label>
                            <input type="number" id="modif_engine_power" name="engine_power" min="0">
                        </div>

                        <div class="form-group">
                            <label for="modif_purchase_date">Date d'achat</label>
                            <input type="date" id="modif_purchase_date" name="purchase_date">
                        </div>

                        <div class="form-group">
                            <label for="modif_purchase_price">Prix d'achat (€)</label>
                            <input type="number" id="modif_purchase_price" name="purchase_price" min="0" step="0.01">
                        </div>

                        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
                        <h3 style="margin-bottom: 15px; font-size: 1.1em;">Suivi assurance kilométrique</h3>

                        <div class="form-group">
                            <label for="modif_insurance_km_limit">Limite kilométrique initiale (km)</label>
                            <input type="number" id="modif_insurance_km_limit" name="insurance_km_limit" min="0" placeholder="Ex: 60000">
                        </div>

                        <div class="form-group">
                            <label for="modif_insurance_km_annual_increase">Augmentation annuelle (km)</label>
                            <input type="number" id="modif_insurance_km_annual_increase" name="insurance_km_annual_increase" min="0" placeholder="Ex: 20000">
                        </div>

                        <div class="form-group">
                            <label for="modif_insurance_km_start_date">Date de début du suivi</label>
                            <input type="date" id="modif_insurance_km_start_date" name="insurance_km_start_date">
                        </div>

                        <div class="form-group">
                            <label for="modif_notes">Notes personnelles</label>
                            <textarea id="modif_notes" name="notes" rows="3" placeholder="Notes, commentaires ou informations supplémentaires..."></textarea>
                        </div>
                    </form>
                </div>
                <div class="popup-footer">
                    <button type="button" class="btn btn-secondary" id="cancelModifBtn">Annuler</button>
                    <button type="submit" class="btn btn-primary" form="vehicleModifForm" id="submitModifBtn">Modifier</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);
    }

    // Remplir le formulaire avec les données du véhicule
    populateForm(vehicle) {
        const form = document.getElementById('vehicleModifForm');
        if (!form) return;

        // Remplir les champs du formulaire
        this.setFieldValue('modif_brand', vehicle.brand);
        this.setFieldValue('modif_model', vehicle.model);
        this.setFieldValue('modif_year', vehicle.year);
        this.setFieldValue('modif_fuel_type', vehicle.fuel_type);
        this.setFieldValue('modif_license_plate', vehicle.license_plate);
        this.setFieldValue('modif_mileage', vehicle.mileage);
        this.setFieldValue('modif_fuel_capacity', vehicle.fuel_capacity);
        this.setFieldValue('modif_engine_power', vehicle.engine_power);
        this.setFieldValue('modif_notes', vehicle.notes);
        
        // Gestion spéciale pour la date
        if (vehicle.purchase_date) {
            const date = new Date(vehicle.purchase_date);
            const formattedDate = date.toISOString().split('T')[0];
            this.setFieldValue('modif_purchase_date', formattedDate);
        }

        this.setFieldValue('modif_purchase_price', vehicle.purchase_price);

        // Insurance mileage tracking fields
        this.setFieldValue('modif_insurance_km_limit', vehicle.insurance_km_limit);
        this.setFieldValue('modif_insurance_km_annual_increase', vehicle.insurance_km_annual_increase);

        if (vehicle.insurance_km_start_date) {
            const insuranceDate = new Date(vehicle.insurance_km_start_date);
            const formattedInsuranceDate = insuranceDate.toISOString().split('T')[0];
            this.setFieldValue('modif_insurance_km_start_date', formattedInsuranceDate);
        }
    }

    // Méthode utilitaire pour définir la valeur d'un champ
    setFieldValue(fieldId, value) {
        const field = document.getElementById(fieldId);
        if (field && value !== null && value !== undefined) {
            field.value = value;
        }
    }

    // Attacher les événements du formulaire
    attachEventListeners() {
        const form = document.getElementById('vehicleModifForm');
        const closeBtn = this.overlay.querySelector('.popup-close');
        const cancelBtn = document.getElementById('cancelModifBtn');
        const submitBtn = document.getElementById('submitModifBtn');
        
        // Événement de soumission du formulaire
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleFormSubmit();
            });
        }

        // Événements de fermeture
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.hide());
        }

        // Formater automatiquement la plaque d'immatriculation
        const licensePlateInput = document.getElementById('modif_license_plate');
        if (licensePlateInput) {
            licensePlateInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.toUpperCase();
            });
        }
    }

    // Gérer la soumission du formulaire
    async handleFormSubmit() {
        try {
            this.showMessage('Modification en cours...', 'info');
            this.setSubmitButtonLoading(true);

            const formData = new FormData(document.getElementById('vehicleModifForm'));
            const vehicleData = {};

            // Convertir FormData en objet
            for (let [key, value] of formData.entries()) {
                if (value.trim() !== '') {
                    // Conversion des types appropriés
                    if (['year', 'mileage', 'engine_power'].includes(key)) {
                        vehicleData[key] = parseInt(value);
                    } else if (['fuel_capacity', 'purchase_price', 'insurance_km_limit', 'insurance_km_annual_increase'].includes(key)) {
                        vehicleData[key] = parseFloat(value);
                    } else {
                        vehicleData[key] = value;
                    }
                }
            }

            // Validation côté client
            if (!this.validateVehicleData(vehicleData)) {
                return;
            }

            // Envoyer les modifications au serveur
            const response = await fetch(`${this.baseURL}/vehicles/${this.currentVehicle.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(vehicleData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Erreur lors de la modification');
            }

            const updatedVehicle = await response.json();
            
            this.showMessage('Véhicule modifié avec succès !', 'success');
            
            // Fermer le popup après un délai
            setTimeout(() => {
                this.hide();
                // Callback pour actualiser la liste des véhicules
                if (this.onVehicleModified) {
                    this.onVehicleModified();
                }
            }, 1500);

        } catch (error) {
            console.error('Erreur lors de la modification:', error);
            this.showMessage(error.message, 'error');
        } finally {
            this.setSubmitButtonLoading(false);
        }
    }

    // Validation des données
    validateVehicleData(data) {
        if (!data.brand || data.brand.length < 2) {
            this.showMessage('La marque doit contenir au moins 2 caractères', 'error');
            return false;
        }

        if (!data.model || data.model.length < 1) {
            this.showMessage('Le modèle est requis', 'error');
            return false;
        }

        if (data.year && (data.year < 1900 || data.year > 2030)) {
            this.showMessage('L\'année doit être entre 1900 et 2030', 'error');
            return false;
        }

        if (data.license_plate && !/^[A-Z0-9-]{2,10}$/.test(data.license_plate)) {
            this.showMessage('Format de plaque d\'immatriculation invalide', 'error');
            return false;
        }

        return true;
    }

    // Afficher un message dans le popup
    showMessage(message, type = 'info') {
        const messageDiv = document.getElementById('vehicleModifMessage');
        if (messageDiv) {
            messageDiv.textContent = message;
            messageDiv.className = `message ${type}`;
            messageDiv.style.display = 'block';
            
            // Masquer le message après 5 secondes pour les messages de succès/info
            if (type === 'success' || type === 'info') {
                setTimeout(() => {
                    if (messageDiv) {
                        messageDiv.style.display = 'none';
                    }
                }, 5000);
            }
        }
    }

    // Méthode utilitaire pour afficher un message de chargement
    showLoadingMessage(message) {
        // Pour l'instant, on utilise console.log, mais vous pouvez adapter selon votre système
        console.log(message);
    }

    // Gérer l'état du bouton de soumission
    setSubmitButtonLoading(isLoading) {
        const submitBtn = document.getElementById('submitModifBtn');
        const cancelBtn = document.getElementById('cancelModifBtn');
        
        if (submitBtn) {
            submitBtn.disabled = isLoading;
            submitBtn.textContent = isLoading ? 'Modification...' : 'Modifier';
        }
        
        if (cancelBtn) {
            cancelBtn.disabled = isLoading;
        }
    }

    // Fermer et nettoyer le popup
    hide() {
        if (this.overlay) {
            this.overlay.classList.add('hiding');
            
            setTimeout(() => {
                this.removeExistingPopup();
                this.isVisible = false;
                this.currentVehicle = null;
            }, 300);
        }
    }

    // Supprimer le popup existant
    removeExistingPopup() {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }

    // Méthode utilitaire pour les notifications externes
    showNotification(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // Implémentation simple de notification
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            z-index: 10000;
            font-weight: 500;
            background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

export default VehicleModif;
