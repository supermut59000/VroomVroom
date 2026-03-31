/**
 * i18n — Centralized French string constants.
 *
 * All user-facing labels, messages, placeholders and error strings
 * should be defined here rather than inlined in components.
 *
 * Usage:
 *   import { t } from '@/lib/i18n'
 *   <p>{t.vehicle.brand}</p>
 *   toast.success(t.fuel.addSuccess)
 */

export const t = {
  // ── Common ──────────────────────────────────────────────────────────────────
  common: {
    save: 'Enregistrer',
    cancel: 'Annuler',
    delete: 'Supprimer',
    edit: 'Modifier',
    add: 'Ajouter',
    close: 'Fermer',
    retry: 'Réessayer',
    reset: 'Réinitialiser',
    loading: 'Chargement…',
    error: "Une erreur inattendue s'est produite",
    noData: 'Aucune donnée disponible',
    required: 'Champ requis',
    confirm: 'Confirmer',
  },

  // ── Vehicles ─────────────────────────────────────────────────────────────
  vehicle: {
    brand: 'Marque',
    model: 'Modèle',
    year: 'Année',
    licensePlate: 'Immatriculation',
    fuelType: 'Type de carburant',
    odometer: 'Compteur',
    tankCapacity: 'Capacité réservoir (L)',
    acquisitionDate: "Date d'acquisition",
    purchasePrice: "Prix d'achat",
    description: 'Description',
    active: 'Actif',
    inactive: 'Inactif',
    addTitle: 'Ajouter un véhicule',
    editTitle: 'Modifier le véhicule',
    deleteTitle: 'Supprimer le véhicule ?',
    deleteDescription:
      'Cette action est irréversible. Toutes les données associées (pleins, maintenances) seront également supprimées.',
    addSuccess: 'Véhicule ajouté avec succès',
    updateSuccess: 'Véhicule mis à jour',
    deleteSuccess: 'Véhicule supprimé',
    notFound: 'Véhicule non trouvé',
    duplicatePlate: 'Un véhicule avec cette plaque existe déjà',
    stats: {
      totalFuelEntries: 'Pleins',
      totalDistance: 'Distance',
      avgConsumption: 'Conso',
      totalFuelCost: 'Total carburant',
      costPerKm: 'Coût/km',
      lastOdometer: 'Dernier compteur',
      daysSinceLastEntry: 'Dernier plein il y a',
      days: 'jour',
      daysPlural: 'jours',
    },
    insurance: {
      limitExceeded: 'Limite km assurance dépassée',
      kmRemaining: 'km restants',
    },
  },

  // ── Fuel entries ────────────────────────────────────────────────────────
  fuel: {
    addTitle: 'Ajouter un plein',
    editTitle: 'Modifier le plein',
    viewTitle: 'Historique carburant',
    date: 'Date',
    odometer: 'Compteur',
    liters: 'Litres',
    pricePerLiter: 'Prix/L (€)',
    total: 'Total',
    fullTank: 'Plein complet',
    station: 'Station',
    location: 'Localisation',
    notes: 'Notes',
    captureGps: 'Capturer ma position GPS',
    nearbyStations: 'Stations proches',
    addSuccess: 'Plein ajouté avec succès',
    updateSuccess: 'Plein mis à jour',
    deleteSuccess: 'Plein supprimé',
    offlineQueued: 'Plein enregistré hors-ligne — sera synchronisé au retour de la connexion',
    fuelTypeMismatch:
      'Le type sélectionné ({selected}) diffère du carburant enregistré du véhicule ({vehicle}).',
    odometerLower:
      'Le compteur est inférieur au dernier relevé. Continuer ?',
    odometerSame: 'Le compteur est identique au dernier relevé. Continuer ?',
  },

  // ── Fuel types ──────────────────────────────────────────────────────────
  fuelType: {
    essence: 'Essence',
    diesel: 'Diesel',
    electrique: 'Électrique',
    hybride: 'Hybride',
    gpl: 'GPL',
    e85: 'E85',
  } as Record<string, string>,

  // ── Maintenance ─────────────────────────────────────────────────────────
  maintenance: {
    addTitle: 'Ajouter une maintenance',
    editTitle: 'Modifier la maintenance',
    viewTitle: 'Historique maintenance',
    type: 'Type',
    description: 'Description',
    cost: 'Coût (€)',
    odometer: 'Compteur',
    serviceProvider: 'Prestataire',
    location: 'Lieu',
    date: 'Date',
    notes: 'Notes',
    nextDate: 'Prochaine date',
    nextOdometer: 'Prochain compteur',
    addSuccess: 'Maintenance ajoutée avec succès',
    updateSuccess: 'Maintenance mise à jour',
    deleteSuccess: 'Maintenance supprimée',
    reminders: {
      overdue: 'En retard',
      upcoming: 'À venir',
    },
  },

  // ── Charts / analytics ──────────────────────────────────────────────────
  charts: {
    title: 'Graphiques',
    consumption: 'Consommation (L/100km)',
    price: 'Prix au litre',
    monthlyCost: 'Coûts mensuels',
    distance: 'Distance mensuelle',
    stationsMap: 'Carte des stations',
    flexfuelRentability: 'Rentabilité E85',
    filterStart: 'Début',
    filterEnd: 'Fin',
    filteredEntries: 'entrées filtrées',
    noDataInRange: 'Aucune donnée pour la période sélectionnée',
    projectedAnnual: 'Projection annuelle',
  },

  // ── FlexFuel ────────────────────────────────────────────────────────────
  flexfuel: {
    conversionTitle: 'Conversion FlexFuel',
    conversionDate: 'Date de conversion',
    kitCost: 'Coût du kit (€)',
    overconsumption: 'Surconsommation (%)',
    kitBrand: 'Marque du kit',
    installer: 'Installateur',
    totalSavings: 'Économies totales',
    breakEven: 'Seuil de rentabilité',
    breakEvenReached: 'Atteint',
    breakEvenPending: 'Non atteint',
    monthlyAvg: 'Économies moyennes/mois',
    skippedFills: '{n} plein(s) ignoré(s) — prix E10 manquant à la date du plein',
  },

  // ── Station prices ──────────────────────────────────────────────────────
  stations: {
    dialogTitle: 'Prix des stations proches',
    radius: 'Rayon',
    sortByPrice: 'Prix',
    sortByDistance: 'Distance',
    cheapest: 'moins cher',
    noResults: 'Aucune station trouvée dans ce rayon',
    gpsRequired: 'Position GPS requise',
  },

  // ── Errors ──────────────────────────────────────────────────────────────
  errors: {
    networkTimeout: 'La requête a expiré — vérifiez votre connexion',
    unauthorized: 'Accès non autorisé — clé API invalide',
    serverError: 'Erreur serveur interne',
    notFound: 'Ressource introuvable',
    unexpectedError: 'Erreur inattendue',
  },

  // ── Offline ─────────────────────────────────────────────────────────────
  offline: {
    banner: 'Hors ligne — certaines fonctionnalités sont limitées',
    syncing: 'Synchronisation en cours…',
    syncSuccess: 'Données synchronisées',
  },
} as const
