import FuelCharts from './FuelCharts.js';
import { fetchApi } from '../config.js';

class FuelView {
    constructor(baseURL, onFuelUpdated) {
        this.baseURL = baseURL;
        this.onFuelUpdated = onFuelUpdated;
        this.currentVehicle = null;
        this.fuelEntries = [];
        this.allFuelEntries = [];
        this.allMaintenanceEntries = [];
        this.isVisible = false;
        this.overlay = null;
        this.pagination = { total: 0, page: 1, perPage: 20, pages: 0 };
        this.fuelCharts = new FuelCharts();

        this.initializeGlobalEventListeners();
    }

    initializeGlobalEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible && !this.fuelCharts.isVisible) {
                this.hide();
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('popup-overlay') && e.target === this.overlay && this.isVisible) {
                this.hide();
            }
        });
    }

    async show(vehicleId) {
        try {
            this.showLoadingMessage('Chargement des données de carburant...');

            this.pagination = { total: 0, page: 1, perPage: 20, pages: 0 };

            const vehicleResponse = await fetchApi(`${this.baseURL}/vehicles/${vehicleId}`);
            if (!vehicleResponse.ok) {
                throw new Error('Erreur lors du chargement du véhicule');
            }
            this.currentVehicle = await vehicleResponse.json();

            // Fetch ALL entries for statistics and charts
            const allFuelResponse = await fetchApi(`${this.baseURL}/fuel-entries/vehicle/${vehicleId}?per_page=10000`);
            if (!allFuelResponse.ok) {
                throw new Error('Erreur lors du chargement des entrées de carburant');
            }
            this.allFuelEntries = await allFuelResponse.json();

            // Fetch maintenance entries for cost/km chart (non-blocking)
            this.allMaintenanceEntries = [];
            try {
                const maintResponse = await fetchApi(`${this.baseURL}/maintenances/vehicle/${vehicleId}`);
                if (maintResponse.ok) {
                    this.allMaintenanceEntries = await maintResponse.json();
                }
            } catch (e) {
                // silently ignore — charts will still work without maintenance data
            }

            this.createPopup();

            // Fetch paginated entries for the list
            await this.loadPaginatedEntries(1);

            this.updateStatistics();
            this.isVisible = true;
            this.overlay.classList.add('show');

        } catch (error) {
            console.error('Erreur:', error);
            this.showNotification('Erreur lors du chargement des données', 'error');
        }
    }

    // ===== PAGINATED LIST LOADING =====

    async loadPaginatedEntries(page = 1) {
        const vid = this.currentVehicle?.id;
        if (!vid) return;

        const sortBy = document.getElementById('sortBy')?.value || 'date_desc';
        const orderBy = sortBy.startsWith('date') ? 'fueling_date' : 'odometer_reading';
        const order = sortBy.endsWith('asc') ? 'asc' : 'desc';

        const params = new URLSearchParams({
            vehicle_id: vid,
            page: page,
            per_page: this.pagination.perPage,
            order_by: orderBy,
            order: order
        });

        try {
            const response = await fetchApi(`${this.baseURL}/fuel-entries/?${params}`);
            if (!response.ok) throw new Error('Erreur lors du chargement des entrées');

            const data = await response.json();
            this.fuelEntries = data.entries;
            this.pagination.total = data.total;
            this.pagination.page = data.page;
            this.pagination.pages = data.pages;

            this.renderFuelEntries();
            this.renderPagination();
        } catch (error) {
            console.error('Erreur pagination:', error);
        }
    }

    // ===== POPUP =====

    createPopup() {
        this.removeExistingPopup();

        this.overlay = document.createElement('div');
        this.overlay.className = 'popup-overlay';
        this.overlay.id = 'fuelViewPopup';

        this.overlay.innerHTML = `
            <div class="popup-container fuel-view-container">
                <div class="popup-header">
                    <h2 class="popup-title">
                        ⛽ Historique carburant - ${this.currentVehicle.brand} ${this.currentVehicle.model}
                    </h2>
                    <button type="button" class="popup-close">&times;</button>
                </div>
                <div class="popup-body">
                    <div class="message" id="fuelViewMessage"></div>

                    <div class="fuel-stats">
                        <div class="stat-card">
                            <span class="stat-label">Total des entrées</span>
                            <span class="stat-value" id="totalEntries">0</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-label">Litres totaux</span>
                            <span class="stat-value" id="totalLiters">0 L</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-label">Coût total</span>
                            <span class="stat-value" id="totalCost">0 €</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-label">Prix moyen/L</span>
                            <span class="stat-value" id="avgPrice">0 €</span>
                        </div>
                    </div>

                    <div class="fuel-entries-container">
                        <div class="entries-header">
                            <h3>Entrées de carburant</h3>
                            <div class="entries-toolbar">
                                <button type="button" class="btn btn-primary btn-sm" id="openChartsBtn">📊 Graphiques</button>
                                <div class="sort-controls">
                                    <label for="sortBy">Trier:</label>
                                    <select id="sortBy">
                                        <option value="date_desc">Date (récent)</option>
                                        <option value="date_asc">Date (ancien)</option>
                                        <option value="odometer_desc">km (élevé)</option>
                                        <option value="odometer_asc">km (faible)</option>
                                    </select>
                                </div>
                                <div class="sort-controls">
                                    <label for="listPerPage">Par page:</label>
                                    <select id="listPerPage">
                                        <option value="20" selected>20</option>
                                        <option value="50">50</option>
                                        <option value="100">100</option>
                                        <option value="10000">Tout</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="fuel-entries-list" id="fuelEntriesList"></div>
                        <div class="pagination-controls" id="paginationControls"></div>
                    </div>
                </div>
                <div class="popup-footer">
                    <button type="button" class="btn btn-secondary" id="closeFuelViewBtn">Fermer</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);
        this.attachEventListeners();
    }

    // ===== FUEL ENTRIES =====

    renderFuelEntries() {
        const entriesList = document.getElementById('fuelEntriesList');
        if (!entriesList) return;

        if (this.fuelEntries.length === 0) {
            entriesList.innerHTML = `
                <div class="no-entries">
                    <p>Aucune entrée de carburant trouvée pour ce véhicule.</p>
                </div>
            `;
            return;
        }

        const entriesHTML = this.fuelEntries.map((entry) => `
            <div class="fuel-entry-card ${entry.is_full_tank === false ? 'partial-fill' : ''}" data-entry-id="${entry.id}">
                <div class="entry-header">
                    <div class="entry-date">
                        📅 ${this.formatDate(entry.fueling_date)}
                        ${entry.is_full_tank === false ? '<span class="partial-badge">Partiel</span>' : ''}
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
                        <span class="field-value fuel-type">${this.formatFuelType(entry.fuel_type)}</span>
                    </div>
                    <div class="entry-field">
                        <span class="field-label">Litres:</span>
                        <span class="field-value">${entry.liters} L</span>
                    </div>
                    <div class="entry-field">
                        <span class="field-label">Prix/L:</span>
                        <span class="field-value">${entry.price_per_liter} €</span>
                    </div>
                    <div class="entry-field">
                        <span class="field-label">Kilométrage:</span>
                        <span class="field-value">${entry.odometer_reading} km</span>
                    </div>
                    <div class="entry-field total">
                        <span class="field-label">Total:</span>
                        <span class="field-value">${(entry.liters * entry.price_per_liter).toFixed(2)} €</span>
                    </div>
                </div>
            </div>
        `).join('');

        entriesList.innerHTML = entriesHTML;
        this.attachEntryEventListeners();
    }

    // ===== PAGINATION =====

    renderPagination() {
        const container = document.getElementById('paginationControls');
        if (!container) return;

        if (this.pagination.pages <= 1) {
            container.innerHTML = '';
            return;
        }

        const { page, pages, total } = this.pagination;

        container.innerHTML = `
            <div class="pagination">
                <button type="button" class="btn btn-secondary btn-sm pagination-btn" id="paginationPrev" ${page <= 1 ? 'disabled' : ''}>
                    ← Précédent
                </button>
                <span class="pagination-info">
                    Page ${page} / ${pages} (${total} entrées)
                </span>
                <button type="button" class="btn btn-secondary btn-sm pagination-btn" id="paginationNext" ${page >= pages ? 'disabled' : ''}>
                    Suivant →
                </button>
            </div>
        `;

        document.getElementById('paginationPrev')?.addEventListener('click', () => {
            if (this.pagination.page > 1) this.loadPaginatedEntries(this.pagination.page - 1);
        });

        document.getElementById('paginationNext')?.addEventListener('click', () => {
            if (this.pagination.page < this.pagination.pages) this.loadPaginatedEntries(this.pagination.page + 1);
        });
    }

    attachEntryEventListeners() {
        document.querySelectorAll('.edit-entry').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.editFuelEntry(button.getAttribute('data-entry-id'));
            });
        });

        document.querySelectorAll('.delete-entry').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.deleteFuelEntry(button.getAttribute('data-entry-id'));
            });
        });
    }

    updateStatistics() {
        const totalLiters = this.allFuelEntries.reduce((sum, e) => sum + e.liters, 0);
        const totalCost = this.allFuelEntries.reduce((sum, e) => sum + (e.liters * e.price_per_liter), 0);
        const avgPrice = this.allFuelEntries.length > 0 ? totalCost / totalLiters : 0;

        const totalEl = document.getElementById('totalEntries');
        const litersEl = document.getElementById('totalLiters');
        const costEl = document.getElementById('totalCost');
        const priceEl = document.getElementById('avgPrice');

        if (totalEl) totalEl.textContent = this.allFuelEntries.length;
        if (litersEl) litersEl.textContent = `${totalLiters.toFixed(1)} L`;
        if (costEl) costEl.textContent = `${totalCost.toFixed(2)} €`;
        if (priceEl) priceEl.textContent = `${avgPrice.toFixed(3)} €`;
    }

    attachEventListeners() {
        const closeBtn = this.overlay.querySelector('.popup-close');
        const closeBtnFooter = document.getElementById('closeFuelViewBtn');
        const sortSelect = document.getElementById('sortBy');
        const perPageSelect = document.getElementById('listPerPage');
        const chartsBtn = document.getElementById('openChartsBtn');

        if (closeBtn) closeBtn.addEventListener('click', () => this.hide());
        if (closeBtnFooter) closeBtnFooter.addEventListener('click', () => this.hide());
        if (sortSelect) sortSelect.addEventListener('change', () => this.loadPaginatedEntries(1));
        if (perPageSelect) perPageSelect.addEventListener('change', () => {
            this.pagination.perPage = parseInt(perPageSelect.value);
            this.loadPaginatedEntries(1);
        });
        if (chartsBtn) chartsBtn.addEventListener('click', () => {
            this.fuelCharts.show(this.currentVehicle, this.allFuelEntries, this.allMaintenanceEntries);
        });
    }

    // ===== EDIT FUEL ENTRY =====

    async editFuelEntry(entryId) {
        const entry = this.fuelEntries.find(e => e.id == entryId);
        if (!entry) return;

        const editOverlay = document.createElement('div');
        editOverlay.className = 'popup-overlay edit-fuel-overlay';
        editOverlay.id = 'editFuelPopup';

        editOverlay.innerHTML = `
            <div class="popup-container">
                <div class="popup-header">
                    <h2 class="popup-title">Modifier l'entrée de carburant</h2>
                    <button type="button" class="popup-close">&times;</button>
                </div>
                <div class="popup-body">
                    <div class="message" id="editFuelMessage"></div>
                    <form class="popup-form" id="editFuelForm">
                        <div class="form-group">
                            <label for="edit_fuel_type">Type de carburant *</label>
                            <select id="edit_fuel_type" name="fuel_type" required>
                                <option value="">Sélectionner...</option>
                                <option value="essence">Essence</option>
                                <option value="diesel">Diesel</option>
                                <option value="electrique">Électrique</option>
                                <option value="hybride">Hybride</option>
                                <option value="gpl">GPL</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="edit_liters">Litres *</label>
                            <input type="number" id="edit_liters" name="liters" required min="0" step="0.01">
                        </div>
                        <div class="form-group">
                            <label for="edit_price_per_liter">Prix par litre (€) *</label>
                            <input type="number" id="edit_price_per_liter" name="price_per_liter" required min="0" step="0.001">
                        </div>
                        <div class="form-group">
                            <label for="edit_odometer_reading">Kilométrage *</label>
                            <input type="number" id="edit_odometer_reading" name="odometer_reading" required min="0">
                        </div>
                        <div class="form-group">
                            <label for="edit_fueling_date">Date de plein *</label>
                            <input type="datetime-local" id="edit_fueling_date" name="fueling_date" required>
                        </div>
                        <div class="form-group form-group-checkbox">
                            <label for="edit_is_full_tank" class="checkbox-label">
                                <input type="checkbox" id="edit_is_full_tank" name="is_full_tank">
                                <span>Plein complet</span>
                            </label>
                            <small class="form-hint">Décochez si c'est un plein partiel</small>
                        </div>
                        <div class="form-group">
                            <div class="calculated-total">
                                <strong>Total calculé: <span id="calculatedTotal">0.00 €</span></strong>
                            </div>
                        </div>
                    </form>
                </div>
                <div class="popup-footer">
                    <button type="button" class="btn btn-secondary" id="cancelEditBtn">Annuler</button>
                    <button type="submit" class="btn btn-primary" form="editFuelForm" id="submitEditBtn">Modifier</button>
                </div>
            </div>
        `;

        document.body.appendChild(editOverlay);
        setTimeout(() => editOverlay.classList.add('show'), 10);

        this.populateEditForm(entry);
        this.attachEditFormEvents(editOverlay, entry);
    }

    populateEditForm(entry) {
        document.getElementById('edit_fuel_type').value = entry.fuel_type || '';
        document.getElementById('edit_liters').value = entry.liters || '';
        document.getElementById('edit_price_per_liter').value = entry.price_per_liter || '';
        document.getElementById('edit_odometer_reading').value = entry.odometer_reading || '';

        if (entry.fueling_date) {
            const date = new Date(entry.fueling_date);
            document.getElementById('edit_fueling_date').value = date.toISOString().slice(0, 16);
        }

        document.getElementById('edit_is_full_tank').checked = entry.is_full_tank !== false;
        this.updateCalculatedTotal();
    }

    attachEditFormEvents(editOverlay, entry) {
        const form = document.getElementById('editFuelForm');
        const closeBtn = editOverlay.querySelector('.popup-close');
        const cancelBtn = document.getElementById('cancelEditBtn');
        const litersInput = document.getElementById('edit_liters');
        const priceInput = document.getElementById('edit_price_per_liter');

        const closeEdit = () => {
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

        [litersInput, priceInput].forEach(input => {
            input.addEventListener('input', () => this.updateCalculatedTotal());
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleEditFormSubmit(entry.id, editOverlay);
        });
    }

    updateCalculatedTotal() {
        const liters = parseFloat(document.getElementById('edit_liters').value) || 0;
        const pricePerLiter = parseFloat(document.getElementById('edit_price_per_liter').value) || 0;
        document.getElementById('calculatedTotal').textContent = `${(liters * pricePerLiter).toFixed(2)} €`;
    }

    async handleEditFormSubmit(entryId, editOverlay) {
        try {
            this.showEditMessage('Modification en cours...', 'info');
            this.setEditSubmitButtonLoading(true);

            const formData = new FormData(document.getElementById('editFuelForm'));
            const entryData = {};

            for (let [key, value] of formData.entries()) {
                if (value.trim() !== '') {
                    if (['liters', 'price_per_liter'].includes(key)) {
                        entryData[key] = parseFloat(value);
                    } else if (key === 'odometer_reading') {
                        entryData[key] = parseInt(value);
                    } else {
                        entryData[key] = value;
                    }
                }
            }

            entryData.is_full_tank = document.getElementById('edit_is_full_tank').checked;

            if (!this.validateFuelEntryData(entryData)) return;

            const response = await fetchApi(`${this.baseURL}/fuel-entries/${entryId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entryData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Erreur lors de la modification');
            }

            this.showEditMessage('Entrée modifiée avec succès !', 'success');

            setTimeout(() => {
                editOverlay.classList.remove('show');
                editOverlay.classList.add('hiding');
                setTimeout(async () => {
                    editOverlay.remove();
                    await this.reloadAllEntries();
                    if (this.onFuelUpdated) this.onFuelUpdated();
                }, 300);
            }, 1500);

        } catch (error) {
            console.error('Erreur lors de la modification:', error);
            this.showEditMessage(error.message, 'error');
        } finally {
            this.setEditSubmitButtonLoading(false);
        }
    }

    async deleteFuelEntry(entryId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette entrée de carburant ?')) return;

        try {
            const response = await fetchApi(`${this.baseURL}/fuel-entries/${entryId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Erreur lors de la suppression');

            await this.reloadAllEntries();
            this.showMessage('Entrée supprimée avec succès', 'success');
            if (this.onFuelUpdated) this.onFuelUpdated();
        } catch (error) {
            console.error('Erreur lors de la suppression:', error);
            this.showMessage('Erreur lors de la suppression', 'error');
        }
    }

    async reloadAllEntries() {
        const vid = this.currentVehicle?.id;
        if (!vid) return;

        const allFuelResponse = await fetchApi(`${this.baseURL}/fuel-entries/vehicle/${vid}?per_page=10000`);
        if (allFuelResponse.ok) {
            this.allFuelEntries = await allFuelResponse.json();
        }

        this.updateStatistics();
        await this.loadPaginatedEntries(this.pagination.page);
    }

    validateFuelEntryData(data) {
        if (!data.fuel_type) { this.showEditMessage('Le type de carburant est requis', 'error'); return false; }
        if (!data.liters || data.liters <= 0) { this.showEditMessage('La quantité de litres doit être supérieure à 0', 'error'); return false; }
        if (!data.price_per_liter || data.price_per_liter <= 0) { this.showEditMessage('Le prix par litre doit être supérieur à 0', 'error'); return false; }
        if (!data.odometer_reading || data.odometer_reading < 0) { this.showEditMessage('Le kilométrage doit être valide', 'error'); return false; }
        if (!data.fueling_date) { this.showEditMessage('La date de plein est requise', 'error'); return false; }
        return true;
    }

    // ===== UTILITIES =====

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR', {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    formatFuelType(fuelType) {
        const types = {
            'essence': '⛽ Essence', 'diesel': '🚛 Diesel',
            'electrique': '🔋 Électrique', 'hybride': '🔋⛽ Hybride', 'gpl': '🏭 GPL'
        };
        return types[fuelType] || fuelType;
    }

    showMessage(message, type = 'info') {
        const messageDiv = document.getElementById('fuelViewMessage');
        if (messageDiv) {
            messageDiv.textContent = message;
            messageDiv.className = `message ${type}`;
            messageDiv.style.display = 'block';
            if (type === 'success' || type === 'info') {
                setTimeout(() => { if (messageDiv) messageDiv.style.display = 'none'; }, 5000);
            }
        }
    }

    showEditMessage(message, type = 'info') {
        const messageDiv = document.getElementById('editFuelMessage');
        if (messageDiv) {
            messageDiv.textContent = message;
            messageDiv.className = `message ${type}`;
            messageDiv.style.display = 'block';
            if (type === 'success' || type === 'info') {
                setTimeout(() => { if (messageDiv) messageDiv.style.display = 'none'; }, 5000);
            }
        }
    }

    setEditSubmitButtonLoading(isLoading) {
        const submitBtn = document.getElementById('submitEditBtn');
        const cancelBtn = document.getElementById('cancelEditBtn');
        if (submitBtn) { submitBtn.disabled = isLoading; submitBtn.textContent = isLoading ? 'Modification...' : 'Modifier'; }
        if (cancelBtn) cancelBtn.disabled = isLoading;
    }

    showLoadingMessage(message) {
        console.log(message);
    }

    hide() {
        if (this.overlay) {
            this.overlay.classList.add('hiding');
            setTimeout(() => {
                this.removeExistingPopup();
                this.isVisible = false;
                this.currentVehicle = null;
                this.fuelEntries = [];
                this.allFuelEntries = [];
                this.allMaintenanceEntries = [];
            }, 300);
        }
    }

    removeExistingPopup() {
        if (this.overlay) { this.overlay.remove(); this.overlay = null; }
    }

    showNotification(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px; padding: 15px 20px;
            border-radius: 8px; color: white; z-index: 10000; font-weight: 500;
            background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
            box-shadow: 0 4px 12px rgba(0,0,0,0.2); animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

export default FuelView;
