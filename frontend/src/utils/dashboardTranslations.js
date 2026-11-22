const PRIVATE_TRANSLATIONS = {
  fr: {
    dashboard: 'Tableau de bord', bookings: 'Mes Réservations', newBooking: 'Nouvelle Course',
    earnings: 'Mes Gains', invoices: 'Mes Factures', courses: 'Mes Courses', clients: 'Clients',
    admins: 'Flotte Admin', tariffs: 'Tarifs', finance: 'Finance', commissions: 'Commissions',
    documents: 'Documents', legalDocuments: 'Documents légaux', logout: 'Déconnexion',
    totalEarned: 'Total gagné', courseCount: 'Nombre de courses', average: 'Moyenne par course',
    trip: 'Trajet', date: 'Date', totalTtc: 'Prix TTC course', commission: 'Commission déduite',
    gain: 'Mon gain', noEarnings: 'Aucun gain disponible', loading: 'Chargement...',
    totalCumulative: 'Total cumulé', invoiceSearch: 'Rechercher par numéro, client, adresse…',
    noCourses: 'Aucune course disponible', courseNumber: 'N° Course', client: 'Client',
    availability: 'Disponibilité', available: 'Disponible', unavailable: 'Indisponible',
    assigned: 'Assignées', inProgress: 'En cours', completed: 'Terminées', all: 'Toutes',
    departure: 'Départ', arrival: 'Arrivée', passengers: 'Passagers',
  },
  en: {
    dashboard: 'Dashboard', bookings: 'My bookings', newBooking: 'New booking',
    earnings: 'My earnings', invoices: 'My invoices', courses: 'My courses', clients: 'Clients',
    admins: 'Admin fleet', tariffs: 'Pricing', finance: 'Finance', commissions: 'Commissions',
    documents: 'Documents', legalDocuments: 'Legal documents', logout: 'Log out',
    totalEarned: 'Total earned', courseCount: 'Number of trips', average: 'Average per trip',
    trip: 'Trip', date: 'Date', totalTtc: 'Trip total incl. tax', commission: 'Commission deducted',
    gain: 'My earnings', noEarnings: 'No earnings available', loading: 'Loading...',
    totalCumulative: 'Cumulative total', invoiceSearch: 'Search by number, client, address…',
    noCourses: 'No trip available', courseNumber: 'Trip no.', client: 'Client',
    availability: 'Availability', available: 'Available', unavailable: 'Unavailable',
    assigned: 'Assigned', inProgress: 'In progress', completed: 'Completed', all: 'All',
    departure: 'Pickup', arrival: 'Drop-off', passengers: 'Passengers',
  },
};

const SUPPORTED = ['es', 'de', 'it', 'pt', 'nl', 'ru', 'pl', 'ja', 'ko', 'zh', 'ar'];
SUPPORTED.forEach((lang) => { PRIVATE_TRANSLATIONS[lang] = PRIVATE_TRANSLATIONS.en; });

export const translateDashboard = (language, key) =>
  (PRIVATE_TRANSLATIONS[language] || PRIVATE_TRANSLATIONS.fr)[key]
  || PRIVATE_TRANSLATIONS.fr[key]
  || key;
