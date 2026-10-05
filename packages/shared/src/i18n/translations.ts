export type Language = 'fr' | 'en'

export const translations: Record<Language, Record<string, string>> = {
  fr: {
    // App général
    'app.title': 'FlightWatcher',
    'app.subtitle': 'Trouve ton weekend pas cher',
    'app.loading': 'Chargement...',
    'app.error': 'Une erreur est survenue',
    
    // Navigation
    'nav.search': 'Recherche',
    'nav.saved': 'Sauvegardées',
    'nav.favorites': 'Favoris',
    
    // Auth
    'auth.signIn': 'Se connecter',
    'auth.signInWithGoogle': 'Continuer avec Google',
    'auth.signInProgress': 'Connexion...',
    'auth.signInProgressLong': 'Connexion en cours...',
    'auth.signOut': 'Se déconnecter',
    'auth.signOutProgress': 'Déconnexion...',
    'auth.signOutTitle': 'Se déconnecter',
    'auth.userMenu': 'Menu utilisateur',
    'auth.loading': 'Chargement',
    'auth.migration.success': '✅ {searches} recherche(s) et {favorites} favori(s) migré(s)',
    'auth.error.connection': 'Erreur de connexion',
    'auth.error.disconnection': 'Erreur de déconnexion',
    
    // Login page
    'login.title': '✈️ FlightWatcher',
    'login.subtitle': 'Connectez-vous avec Google pour sauvegarder vos recherches et favoris',
    'login.error': '❌ {error}',
    'login.back': '← Retour à l\'application',
    
    // Search
    'search.departure': '✈️ Au départ',
    'search.departurePlaceholder': 'Sélectionnez un aéroport...',
    'search.departureError': '⚠️ Veuillez sélectionner un aéroport valide depuis la liste',
    'search.departureErrorRequired': '⚠️ Veuillez sélectionner un aéroport de départ avant de lancer la recherche',
    'search.when': '📅 Je pars',
    'search.preset.weekend': 'Ce weekend',
    'search.preset.nextWeekend': 'Weekend prochain',
    'search.preset.nextWeek': '3 jours la semaine prochaine',
    'search.preset.flexible': 'Dates flexibles',
    'search.times': '⏰ Horaires pour chaque jour',
    'search.times.departure': 'Horaires de départ',
    'search.times.return': 'Horaires de retour',
    'search.budget': '💰 Budget max / personne',
    'search.budget.total': 'aller-retour par personne',
    'search.launch': 'Lancer la recherche',
    'search.inProgress': 'Recherche en cours...',
    'search.error.noPeriod': 'Veuillez sélectionner une période',
    'search.error.noAirport': '⚠️ Veuillez sélectionner un aéroport de départ avant de lancer la recherche',
    'search.error.invalidAirport': '⚠️ Veuillez sélectionner un aéroport valide depuis la liste avant de lancer la recherche',
    'search.error.noDates': 'Veuillez ajouter au moins une date de départ et une date de retour',
    'search.error.waitDates': 'Veuillez attendre que les dates soient générées',
    
    // Results
    'results.title': 'Résultats de recherche',
    'results.lastSearch': 'Dernière recherche',
    'results.departure': '✈️ Départ:',
    'results.budget': '💰 Budget / pers.:',
    'results.period': '📅 Période:',
    'results.departureDates': '📆 Dates départ:',
    'results.returnDates': '🔙 Dates retour:',
    'results.exclusions': '🚫 Exclusions:',
    'results.destination': 'destination(s)',
    'results.date': 'date(s)',
    'results.saveSearch': '💾 Sauvegarder cette recherche',
    'results.noResults': 'Aucun résultat trouvé',
    'results.roulette': '🎰 Mode Roulette',
    
    // Destination Card
    'card.total': 'par personne · aller-retour',
    'card.departure': 'Aller',
    'card.return': 'Retour',
    'card.book': '✈️ Réserver',
    'card.addFavorite': 'Ajouter aux favoris',
    'card.removeFavorite': 'Retirer des favoris',
    
    // Advanced Options
    'advanced.title': 'Options avancées',
    'advanced.flexibleDates': 'Dates flexibles',
    'advanced.excludedDestinations': 'Destinations exclues',
    'advanced.limitOutbound': 'Limite allers',
    'advanced.addDate': 'Ajouter une date',
    'advanced.remove': 'Supprimer',
    
    // Booking
    'booking.title': 'Réserver votre vol',
    'booking.countdown': '{countdown} seconde{s}',
    'booking.partner': 'Partenaire de réservation',
    'booking.redirect': 'Vous allez être redirigé vers notre partenaire...',
    'booking.cancel': 'Annuler',
    'booking.redirecting': 'Redirection en cours...',
    
    // Favorites
    'favorites.title': 'Mes Favoris',
    'favorites.favoritesTitle': 'Voyages favoris',
    'favorites.empty': 'Aucun favori pour le moment',
    'favorites.added': 'Favori ajouté',
    'favorites.removed': 'Favori retiré',
    'favorites.all': 'Tous',
    'favorites.active': 'Actifs',
    'favorites.archived': 'Archivés',
    
    // Saved Searches
    'saved.title': 'Recherches sauvegardées',
    'saved.empty': 'Aucune recherche sauvegardée',
    'saved.save': 'Sauvegarder',
    'saved.delete': 'Supprimer',
    'saved.load': 'Charger',
    'saved.reload': 'Relancer',
    'saved.name': 'Nom de la recherche',
    'saved.namePlaceholder': 'Ex: Weekend Paris',
    'saved.saveSuccess': 'Recherche sauvegardée avec succès',
    'saved.saveError': 'Erreur lors de la sauvegarde',
    'saved.deleteSuccess': 'Recherche supprimée',
    'saved.deleteError': 'Erreur lors de la suppression',
    'saved.loadError': 'Erreur lors du chargement',
    'saved.noSearchToSave': 'Aucune recherche à sauvegarder. Veuillez d\'abord effectuer une recherche.',
    'saved.loginRequired': 'Veuillez vous connecter pour sauvegarder une recherche',
    
    // User Profile
    'profile.title': '👤 Mon Profil',
    'profile.homeAirport': 'Aéroport de départ par défaut',
    'profile.homeAirportPlaceholder': 'Ex: BVA, MRS, NCE...',
    'profile.homeAirportHelp': 'Code IATA de votre aéroport de départ préféré (3 lettres)',
    'profile.referralCode': 'Code de parrainage',
    'profile.save': 'Enregistrer',
    'profile.saved': 'Profil enregistré avec succès',
    'profile.error': 'Erreur lors de l\'enregistrement',
    
    // Language
    'language.switch': 'Changer la langue',
    'language.fr': 'Français',
    'language.en': 'English',
  },
  en: {
    // General App
    'app.title': 'FlightWatcher',
    'app.subtitle': 'Find your cheap weekend',
    'app.loading': 'Loading...',
    'app.error': 'An error occurred',
    
    // Navigation
    'nav.search': 'Search',
    'nav.saved': 'Saved',
    'nav.favorites': 'Favorites',
    
    // Auth
    'auth.signIn': 'Sign in',
    'auth.signInWithGoogle': 'Continue with Google',
    'auth.signInProgress': 'Signing in...',
    'auth.signInProgressLong': 'Signing in...',
    'auth.signOut': 'Sign out',
    'auth.signOutProgress': 'Signing out...',
    'auth.signOutTitle': 'Sign out',
    'auth.userMenu': 'User menu',
    'auth.loading': 'Loading',
    'auth.migration.success': '✅ {searches} search(es) and {favorites} favorite(s) migrated',
    'auth.error.connection': 'Connection error',
    'auth.error.disconnection': 'Disconnection error',
    
    // Login page
    'login.title': '✈️ FlightWatcher',
    'login.subtitle': 'Sign in with Google to save your searches and favorites',
    'login.error': '❌ {error}',
    'login.back': '← Back to application',
    
    // Search
    'search.departure': '✈️ Departure',
    'search.departurePlaceholder': 'Select an airport...',
    'search.departureError': '⚠️ Please select a valid airport from the list',
    'search.departureErrorRequired': '⚠️ Please select a departure airport before starting the search',
    'search.when': '📅 I\'m leaving',
    'search.preset.weekend': 'This weekend',
    'search.preset.nextWeekend': 'Next weekend',
    'search.preset.nextWeek': '3 days next week',
    'search.preset.flexible': 'Flexible dates',
    'search.times': '⏰ Times for each day',
    'search.times.departure': 'Departure times',
    'search.times.return': 'Return times',
    'search.budget': '💰 Max budget / person',
    'search.budget.total': 'round trip per person',
    'search.launch': 'Launch search',
    'search.inProgress': 'Search in progress...',
    'search.error.noPeriod': 'Please select a period',
    'search.error.noAirport': '⚠️ Please select a departure airport before starting the search',
    'search.error.invalidAirport': '⚠️ Please select a valid airport from the list before starting the search',
    'search.error.noDates': 'Please add at least one departure date and one return date',
    'search.error.waitDates': 'Please wait for dates to be generated',
    
    // Results
    'results.title': 'Search results',
    'results.lastSearch': 'Last search',
    'results.departure': '✈️ Departure:',
    'results.budget': '💰 Budget / person:',
    'results.period': '📅 Period:',
    'results.departureDates': '📆 Departure dates:',
    'results.returnDates': '🔙 Return dates:',
    'results.exclusions': '🚫 Exclusions:',
    'results.destination': 'destination(s)',
    'results.date': 'date(s)',
    'results.saveSearch': '💾 Save this search',
    'results.noResults': 'No results found',
    'results.roulette': '🎰 Roulette Mode',
    
    // Destination Card
    'card.total': 'per person · round trip',
    'card.departure': 'Outbound',
    'card.return': 'Return',
    'card.book': '✈️ Book',
    'card.addFavorite': 'Add to favorites',
    'card.removeFavorite': 'Remove from favorites',
    
    // Advanced Options
    'advanced.title': 'Advanced options',
    'advanced.flexibleDates': 'Flexible dates',
    'advanced.excludedDestinations': 'Excluded destinations',
    'advanced.limitOutbound': 'Outbound limit',
    'advanced.addDate': 'Add a date',
    'advanced.remove': 'Remove',
    
    // Booking
    'booking.title': 'Book your flight',
    'booking.countdown': '{countdown} second{s}',
    'booking.partner': 'Booking partner',
    'booking.redirect': 'You will be redirected to our partner...',
    'booking.cancel': 'Cancel',
    'booking.redirecting': 'Redirecting...',
    
    // Favorites
    'favorites.title': 'My Favorites',
    'favorites.favoritesTitle': 'Favorite trips',
    'favorites.empty': 'No favorites yet',
    'favorites.added': 'Favorite added',
    'favorites.removed': 'Favorite removed',
    'favorites.all': 'All',
    'favorites.active': 'Active',
    'favorites.archived': 'Archived',
    
    // Saved Searches
    'saved.title': 'Saved searches',
    'saved.empty': 'No saved searches',
    'saved.save': 'Save',
    'saved.delete': 'Delete',
    'saved.load': 'Load',
    'saved.reload': 'Reload',
    'saved.name': 'Search name',
    'saved.namePlaceholder': 'Ex: Paris Weekend',
    'saved.saveSuccess': 'Search saved successfully',
    'saved.saveError': 'Error saving search',
    'saved.deleteSuccess': 'Search deleted',
    'saved.deleteError': 'Error deleting search',
    'saved.loadError': 'Error loading search',
    'saved.noSearchToSave': 'No search to save. Please perform a search first.',
    'saved.loginRequired': 'Please sign in to save a search',
    
    // User Profile
    'profile.title': '👤 My Profile',
    'profile.homeAirport': 'Default departure airport',
    'profile.homeAirportPlaceholder': 'Ex: BVA, MRS, NCE...',
    'profile.homeAirportHelp': 'IATA code of your preferred departure airport (3 letters)',
    'profile.referralCode': 'Referral code',
    'profile.save': 'Save',
    'profile.saved': 'Profile saved successfully',
    'profile.error': 'Error saving profile',
    
    // Language
    'language.switch': 'Switch language',
    'language.fr': 'Français',
    'language.en': 'English',
  },
};

export function translate(
  language: Language,
  key: string,
  params?: Record<string, string | number>
): string {
  let translation = translations[language][key];
  if (!translation) {
    const fallbackLang = language === 'fr' ? 'en' : 'fr';
    translation = translations[fallbackLang][key] || key;
  }
  if (params) {
    translation = translation.replace(/\{(\w+)\}/g, (_match, paramKey: string) => {
      const value = params[paramKey];
      if (value === undefined) return _match;
      return String(value);
    });
    translation = translation.replace(/\{s\}/g, () => {
      const count = params.count || params.searches || params.favorites || 0;
      return Number(count) > 1 ? 's' : '';
    });
  }
  return translation;
}
