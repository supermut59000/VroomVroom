class MaintenanceView {
    constructor(baseURL, onMaintenanceUpdated) {
        this.baseURL = baseURL;
        this.onMaintenanceUpdated = onMaintenanceUpdated;
        this.currentVehicle = null;
        this.maintenanceEntries = [];
        this.isVisible = false;
        this.overlay = null;
        this.onAddMaintenance = null;

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
            this.showLoadingMessage('Chargement des données de maintenance...');

            // Charger les données du véhicule
            const vehicleResponse = await fetch(`${this.baseURL}/vehicles/${vehicleId}`);
            if (!vehicleResponse.ok) {
                throw new Error('Erreur lors du chargement du véhicule');
            }
            this.currentVehicle = await vehicleResponse.json();

            // Charger les entrées de maintenance
            const maintenanceResponse = await fetch(`${this.baseURL}/maintenances/vehicle/${vehicleId}`);
            if (!maintenanceResponse.ok) {
                throw new Error('Erreur lors du chargement des maintenances');
            }
            this.maintenanceEntries = await maintenanceResponse.json();

            this.createPopup();
            this.renderMaintenanceEntries();
            this.isVisible = true;
            this.overlay.classList.add('show');

        } catch (error) {
            console.error('Erreur:', error);
            this.showNotification('Erreur lors du chargement des données', 'error');
        }
    }

    // Créer le popup principal
    createPopup() {
        // Supprimer le popup existant s'il y en a un
        this.removeExistingPopup();

        // Créer l'overlay du popup
        this.overlay = document.createElement('div');
        this.overlay.className = 'popup-overlay';
        this.overlay.id = 'maintenanceViewPopup';

        this.overlay.innerHTML = `
            <div class="popup-container fuel-view-container">
                <div class="popup-header">
                    <h2 class="popup-title">
                        🔧 Historique maintenance - ${this.currentVehicle.brand} ${this.currentVehicle.model}
                    </h2>
                    <button type="button" class="popup-close">&times;</button>
                </div>
                <div class="popup-body">
                    <div class="message" id="maintenanceViewMessage"></div>

                    <div class="fuel-stats">
                        <div class="stat-card">
                            <span class="stat-label">Total des entrées</span>
                            <span class="stat-value" id="totalEntries">${this.maintenanceEntries.length}</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-label">Coût total</span>
                            <span class="stat-value" id="totalCost">0 €</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-label">Coût moyen</span>
                            <span class="stat-value" id="avgCost">0 €</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-label">Dernière maintenance</span>
                            <span class="stat-value" id="lastMaintenance">N/A</span>
                        </div>
                    </div>

                    <div id="costBreakdown" class="cost-breakdown"></div>

                    <div class="fuel-entries-container">
                        <div class="entries-header">
                            <h3>Entrées de maintenance</h3>
                            <div class="sort-controls">
                                <label for="sortBy">Trier par:</label>
                                <select id="sortBy">
                                    <option value="date_desc">Date (récent)</option>
                                    <option value="date_asc">Date (ancien)</option>
                                    <option value="cost_desc">Coût (élevé)</option>
                                    <option value="cost_asc">Coût (faible)</option>
                                </select>
                            </div>
                        </div>
                        <div class="fuel-entries-list" id="maintenanceEntriesList">
                            <!-- Les entrées seront générées ici -->
                        </div>
                    </div>
                </div>
                <div class="popup-footer">
                    <button type="button" class="btn btn-secondary" id="closeMaintenanceViewBtn">Fermer</button>
                    <button type="button" class="btn btn-primary" id="addMaintenanceBtn">Ajouter</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);
        this.attachEventListeners();
    }

    // Rendre les entrées de maintenance
    renderMaintenanceEntries() {
        const entriesList = document.getElementById('maintenanceEntriesList');
        if (!entriesList) return;

        if (this.maintenanceEntries.length === 0) {
            entriesList.innerHTML = `
                <div class="no-entries">
                    <p>Aucune entrée de maintenance trouvée pour ce véhicule.</p>
                </div>
            `;
            return;
        }

        // Calculer les statistiques
        this.updateStatistics();

        // Trier les entrées
        this.sortEntries();

        // Générer le HTML des entrées
        const entriesHTML = this.maintenanceEntries.map((entry) => `
            <div class="fuel-entry-card" data-entry-id="${entry.id}">
                <div class="entry-header">
                    <div class="entry-date">
                        📅 ${this.formatDate(entry.maintenance_date)}
                    </div>
                    <div class="entry-actions">
                        <button type="button" class="btn-icon edit-entry" title="Modifier" data-entry-id="${entry.id}">
                            <span style="pointer-events: none;">✏️</span>
                        </button>
                        <button type="button" class="btn-icon delete-entry" title="Supprimer" data-entry-id="${entry.id}">
                            <span style="pointer-events: none;">🗑️</span>
                        </button>
                    </div>
                </div>
                <div class="entry-content">
                    <div class="entry-field">
                        <span class="field-label">Type:</span>
                        <span class="field-value maintenance-type">${this.formatMaintenanceType(entry.maintenance_type)}</span>
                    </div>
                    ${entry.description ? `
                    <div class="entry-field">
                        <span class="field-label">Description:</span>
                        <span class="field-value">${entry.description}</span>
                    </div>
                    ` : ''}
                    <div class="entry-field">
                        <span class="field-label">Kilométrage:</span>
                        <span class="field-value">${entry.odometer_reading} km</span>
                    </div>
                    <div class="entry-field total">
                        <span class="field-label">Coût:</span>
                        <span class="field-value">${entry.cost.toFixed(2)} €</span>
                    </div>
                    ${entry.service_provider ? `
                    <div class="entry-field">
                        <span class="field-label">Prestataire:</span>
                        <span class="field-value">${entry.service_provider}</span>
                    </div>
                    ` : ''}
                    ${entry.next_maintenance_date || entry.next_maintenance_odometer ? `
                    <div class="entry-field next-maintenance">
                        <span class="field-label">Prochaine:</span>
                        <span class="field-value">
                            ${entry.next_maintenance_date ? this.formatShortDate(entry.next_maintenance_date) : ''}
                            ${entry.next_maintenance_odometer ? `à ${entry.next_maintenance_odometer} km` : ''}
                        </span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `).join('');

        entriesList.innerHTML = entriesHTML;

        // Attacher les événements après avoir créé le HTML
        this.attachEntryEventListeners();
    }

    // Attachement des événements pour les entrées
    attachEntryEventListeners() {
        // Event listeners pour les boutons de modification
        document.querySelectorAll('.edit-entry').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const entryId = button.getAttribute('data-entry-id');
                this.editMaintenanceEntry(entryId);
            });
        });

        // Event listeners pour les boutons de suppression
        document.querySelectorAll('.delete-entry').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const entryId = button.getAttribute('data-entry-id');
                this.deleteMaintenanceEntry(entryId);
            });
        });
    }

    // Mettre à jour les statistiques
    updateStatistics() {
        const totalCost = this.maintenanceEntries.reduce((sum, entry) => sum + entry.cost, 0);
        const avgCost = this.maintenanceEntries.length > 0 ? totalCost / this.maintenanceEntries.length : 0;

        // Find last maintenance by date
        const sorted = [...this.maintenanceEntries].sort((a, b) =>
            new Date(b.maintenance_date) - new Date(a.maintenance_date)
        );
        const lastMaintenance = sorted.length > 0
            ? this.formatShortDate(sorted[0].maintenance_date)
            : 'N/A';

        document.getElementById('totalEntries').textContent = this.maintenanceEntries.length;
        document.getElementById('totalCost').textContent = `${totalCost.toFixed(2)} €`;
        document.getElementById('avgCost').textContent = `${avgCost.toFixed(2)} €`;
        document.getElementById('lastMaintenance').textContent = lastMaintenance;

        this.renderCostBreakdown();
    }

    // Render monthly/yearly cost breakdown
    renderCostBreakdown() {
        const container = document.getElementById('costBreakdown');
        if (!container || this.maintenanceEntries.length === 0) {
            if (container) container.innerHTML = '';
            return;
        }

        // Group costs by year and month
        const yearlyData = {};
        this.maintenanceEntries.forEach(entry => {
            const d = new Date(entry.maintenance_date);
            const year = d.getFullYear();
            const month = d.getMonth(); // 0-11

            if (!yearlyData[year]) {
                yearlyData[year] = { total: 0, months: {} };
            }
            yearlyData[year].total += entry.cost;

            if (!yearlyData[year].months[month]) {
                yearlyData[year].months[month] = 0;
            }
            yearlyData[year].months[month] += entry.cost;
        });

        const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

        // Sort years descending
        const years = Object.keys(yearlyData).sort((a, b) => b - a);

        let html = '<div class="breakdown-section"><h3>Coûts par période</h3>';

        years.forEach(year => {
            const data = yearlyData[year];
            const months = Object.keys(data.months).sort((a, b) => b - a);

            html += `
                <div class="breakdown-year">
                    <div class="breakdown-year-header">
                        <span class="breakdown-year-label">${year}</span>
                        <span class="breakdown-year-total">${data.total.toFixed(2)} €</span>
                    </div>
                    <div class="breakdown-months">
                        ${months.map(m => `
                            <div class="breakdown-month">
                                <span class="breakdown-month-label">${monthNames[m]}</span>
                                <span class="breakdown-month-value">${data.months[m].toFixed(2)} €</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    // Trier les entrées
    sortEntries() {
        const sortBy = document.getElementById('sortBy')?.value || 'date_desc';

        this.maintenanceEntries.sort((a, b) => {
            switch (sortBy) {
                case 'date_desc':
                    return new Date(b.maintenance_date) - new Date(a.maintenance_date);
                case 'date_asc':
                    return new Date(a.maintenance_date) - new Date(b.maintenance_date);
                case 'cost_desc':
                    return b.cost - a.cost;
                case 'cost_asc':
                    return a.cost - b.cost;
                default:
                    return 0;
            }
        });
    }

    // Attacher les événements
    attachEventListeners() {
        const closeBtn = this.overlay.querySelector('.popup-close');
        const closeBtnFooter = document.getElementById('closeMaintenanceViewBtn');
        const sortSelect = document.getElementById('sortBy');
        const addBtn = document.getElementById('addMaintenanceBtn');

        // Événements de fermeture
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }
        if (closeBtnFooter) {
            closeBtnFooter.addEventListener('click', () => this.hide());
        }

        // Événement de tri
        if (sortSelect) {
            sortSelect.addEventListener('change', () => this.renderMaintenanceEntries());
        }

        // Événement d'ajout
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                if (this.onAddMaintenance && this.currentVehicle) {
                    this.onAddMaintenance(this.currentVehicle);
                }
            });
        }
    }

    // Supprimer une entrée de maintenance
    async deleteMaintenanceEntry(entryId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette entrée de maintenance ?')) {
            return;
        }

        try {
            const response = await fetch(`${this.baseURL}/maintenances/${entryId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Erreur lors de la suppression');
            }

            // Retirer l'entrée de la liste locale
            this.maintenanceEntries = this.maintenanceEntries.filter(e => e.id != entryId);

            // Rafraîchir l'affichage
            this.renderMaintenanceEntries();
            this.showMessage('Entrée supprimée avec succès', 'success');

            // Callback pour actualiser les données
            if (this.onMaintenanceUpdated) {
                this.onMaintenanceUpdated();
            }

        } catch (error) {
            console.error('Erreur lors de la suppression:', error);
            this.showMessage('Erreur lors de la suppression', 'error');
        }
    }

    // Modifier une entrée de maintenance
    async editMaintenanceEntry(entryId) {
        const entry = this.maintenanceEntries.find(e => e.id == entryId);
        if (!entry) return;

        const editOverlay = document.createElement('div');
        editOverlay.className = 'popup-overlay edit-fuel-overlay';
        editOverlay.id = 'editMaintenancePopup';

        editOverlay.innerHTML = `
            <div class="popup-container">
                <div class="popup-header">
                    <h2 class="popup-title">Modifier la maintenance</h2>
                    <button type="button" class="popup-close">&times;</button>
                </div>
                <div class="popup-body">
                    <div class="message" id="editMaintenanceMessage"></div>
                    <form class="popup-form" id="editMaintenanceForm">
                        <div class="form-group">
                            <label for="edit_maintenance_date">Date *</label>
                            <input type="date" id="edit_maintenance_date" name="maintenance_date" required>
                        </div>
                        <div class="form-group">
                            <label for="edit_maintenance_type">Type *</label>
                            <select id="edit_maintenance_type" name="maintenance_type" required>
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
                            <label for="edit_description">Description</label>
                            <textarea id="edit_description" name="description" rows="2"></textarea>
                        </div>
                        <div class="form-group">
                            <label for="edit_odometer">Kilométrage *</label>
                            <input type="number" id="edit_odometer" name="odometer_reading" min="0" required>
                        </div>
                        <div class="form-group">
                            <label for="edit_cost">Coût (€) *</label>
                            <input type="number" id="edit_cost" name="cost" step="0.01" min="0" required>
                        </div>
                        <div class="form-group">
                            <label for="edit_service_provider">Prestataire</label>
                            <input type="text" id="edit_service_provider" name="service_provider">
                        </div>
                        <div class="form-group">
                            <label for="edit_location">Localisation</label>
                            <input type="text" id="edit_location" name="location">
                        </div>
                        <div class="form-group">
                            <label for="edit_notes">Notes</label>
                            <textarea id="edit_notes" name="notes" rows="2"></textarea>
                        </div>
                    </form>
                </div>
                <div class="popup-footer">
                    <button type="button" class="btn btn-secondary" id="cancelEditMaintenanceBtn">Annuler</button>
                    <button type="submit" class="btn btn-primary" form="editMaintenanceForm">Modifier</button>
                </div>
            </div>
        `;

        document.body.appendChild(editOverlay);
        setTimeout(() => editOverlay.classList.add('show'), 10);

        // Pre-fill the form
        document.getElementById('edit_maintenance_date').value = entry.maintenance_date || '';
        document.getElementById('edit_maintenance_type').value = entry.maintenance_type || 'autre';
        document.getElementById('edit_description').value = entry.description || '';
        document.getElementById('edit_odometer').value = entry.odometer_reading || '';
        document.getElementById('edit_cost').value = entry.cost || '';
        document.getElementById('edit_service_provider').value = entry.service_provider || '';
        document.getElementById('edit_location').value = entry.location || '';
        document.getElementById('edit_notes').value = entry.notes || '';

        // Close handlers
        const closeEdit = () => {
            editOverlay.classList.remove('show');
            editOverlay.classList.add('hiding');
            setTimeout(() => editOverlay.remove(), 300);
        };

        editOverlay.querySelector('.popup-close').addEventListener('click', closeEdit);
        document.getElementById('cancelEditMaintenanceBtn').addEventListener('click', closeEdit);

        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closeEdit();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);

        // Submit handler
        document.getElementById('editMaintenanceForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleEditSubmit(entry.id, editOverlay);
        });
    }

    // Handle edit form submission
    async handleEditSubmit(entryId, editOverlay) {
        const messageDiv = document.getElementById('editMaintenanceMessage');

        try {
            const form = document.getElementById('editMaintenanceForm');
            const formData = new FormData(form);
            const data = {};

            for (let [key, value] of formData.entries()) {
                if (value.trim() !== '') {
                    if (key === 'cost') {
                        data[key] = parseFloat(value);
                    } else if (key === 'odometer_reading') {
                        data[key] = parseInt(value);
                    } else {
                        data[key] = value;
                    }
                } else {
                    data[key] = null;
                }
            }

            const response = await fetch(`${this.baseURL}/maintenances/${entryId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error('Erreur lors de la modification');
            }

            const updated = await response.json();

            // Update local data
            const index = this.maintenanceEntries.findIndex(e => e.id == entryId);
            if (index !== -1) {
                this.maintenanceEntries[index] = updated;
            }

            if (messageDiv) {
                messageDiv.textContent = 'Maintenance modifiée avec succès !';
                messageDiv.className = 'message success';
                messageDiv.style.display = 'block';
            }

            setTimeout(() => {
                editOverlay.classList.remove('show');
                editOverlay.classList.add('hiding');
                setTimeout(() => {
                    editOverlay.remove();
                    this.renderMaintenanceEntries();
                    if (this.onMaintenanceUpdated) this.onMaintenanceUpdated();
                }, 300);
            }, 1000);

        } catch (error) {
            console.error('Erreur:', error);
            if (messageDiv) {
                messageDiv.textContent = error.message;
                messageDiv.className = 'message error';
                messageDiv.style.display = 'block';
            }
        }
    }

    // Méthodes utilitaires
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    formatShortDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    formatMaintenanceType(maintenanceType) {
        const types = {
            'vidange': '🛢️ Vidange',
            'rotation_pneus': '🔄 Rotation pneus',
            'freins': '🛑 Freins',
            'changement_pneus': '🚗 Changement pneus',
            'batterie': '🔋 Batterie',
            'filtre_air': '💨 Filtre à air',
            'bougies': '⚡ Bougies',
            'courroie_distribution': '⚙️ Courroie',
            'controle_technique': '✅ Contrôle technique',
            'autre': '🔧 Autre'
        };
        return types[maintenanceType] || maintenanceType;
    }

    // Messages pour le popup principal
    showMessage(message, type = 'info') {
        const messageDiv = document.getElementById('maintenanceViewMessage');
        if (messageDiv) {
            messageDiv.textContent = message;
            messageDiv.className = `message ${type}`;
            messageDiv.style.display = 'block';

            if (type === 'success' || type === 'info') {
                setTimeout(() => {
                    if (messageDiv) {
                        messageDiv.style.display = 'none';
                    }
                }, 5000);
            }
        }
    }

    // Message de chargement
    showLoadingMessage(message) {
        console.log(message);
    }

    // Fermer et nettoyer le popup
    hide() {
        if (this.overlay) {
            this.overlay.classList.add('hiding');

            setTimeout(() => {
                this.removeExistingPopup();
                this.isVisible = false;
                this.currentVehicle = null;
                this.maintenanceEntries = [];
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

    // Notification externe
    showNotification(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);

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

export default MaintenanceView;
