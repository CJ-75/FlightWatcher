/**
 * Données mockées pour les tests du panneau admin
 * Simule les données réelles sans impacter Supabase
 */

// Générer des dates aléatoires dans les 30 derniers jours
const randomDate = (daysAgo: number = 0) => {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString()
}

// Générer un nombre aléatoire entre min et max
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

// Emails mockés
const mockEmails = [
  'user1@example.com',
  'user2@example.com',
  'user3@example.com',
  'admin@example.com',
  'test@example.com',
  'demo@example.com',
  'john.doe@example.com',
  'jane.smith@example.com',
  'alice.brown@example.com',
  'bob.wilson@example.com'
]

// Aéroports mockés
const mockAirports = ['BVA', 'CDG', 'ORY', 'STN', 'LGW', 'BCN', 'MAD', 'FCO', 'AMS', 'DUB']

// Destinations mockées
const mockDestinations = ['BVA', 'BCN', 'MAD', 'FCO', 'AMS', 'DUB', 'LIS', 'OPO', 'ATH', 'PRG']

// Partenaires mockés
const mockPartners = [
  { id: 'ryanair', name: 'Ryanair' },
  { id: 'skyscanner', name: 'Skyscanner' },
  { id: 'kayak', name: 'Kayak' },
  { id: 'expedia', name: 'Expedia' }
]

export const mockUsers = Array.from({ length: 50 }, (_, i) => ({
  id: `mock-user-${i}`,
  email: mockEmails[i % mockEmails.length],
  full_name: `User ${i + 1}`,
  avatar_url: `https://i.pravatar.cc/150?img=${i + 1}`,
  created_at: randomDate(randomInt(0, 90)),
  last_active: randomDate(randomInt(0, 7)),
  is_admin: i === 0,
  home_airport: mockAirports[i % mockAirports.length],
  stats: {
    searches_count: randomInt(0, 50),
    favorites_count: randomInt(0, 20),
    search_events_count: randomInt(0, 100)
  }
}))

export const mockSearches = Array.from({ length: 100 }, (_, i) => ({
  id: `mock-search-${i}`,
  name: `Recherche ${i + 1}`,
  departure_airport: mockAirports[i % mockAirports.length],
  budget_max: randomInt(100, 500),
  auto_check_enabled: i % 3 === 0,
  times_used: randomInt(0, 20),
  created_at: randomDate(randomInt(0, 60)),
  last_used: i % 2 === 0 ? randomDate(randomInt(0, 7)) : null,
  user_profiles: {
    email: mockEmails[i % mockEmails.length],
    full_name: `User ${i + 1}`
  }
}))

export const mockBookingSasEvents = Array.from({ length: 200 }, (_, i) => ({
  id: `mock-event-${i}`,
  created_at: randomDate(randomInt(0, 30)),
  user_id: i % 2 === 0 ? `mock-user-${i % 10}` : null,
  session_id: i % 2 === 1 ? `session-${i}` : null,
  destination_code: mockDestinations[i % mockDestinations.length],
  destination_name: `Destination ${i + 1}`,
  departure_airport: mockAirports[i % mockAirports.length],
  total_price: randomInt(50, 500),
  partner_id: mockPartners[i % mockPartners.length].id,
  partner_name: mockPartners[i % mockPartners.length].name,
  redirect_url: `https://example.com/booking/${i}`,
  action_type: 'redirect',
  search_event_id: `mock-search-event-${i}`
}))

export const mockPlans = [
  {
    id: 'mock-plan-free',
    name: 'Free',
    description: 'Plan gratuit',
    price_monthly: 0,
    price_yearly: 0,
    max_searches_per_month: 10,
    max_saved_searches: 3,
    active: true,
    created_at: randomDate(90)
  },
  {
    id: 'mock-plan-basic',
    name: 'Basic',
    description: 'Plan basique',
    price_monthly: 9.99,
    price_yearly: 99.99,
    max_searches_per_month: 50,
    max_saved_searches: 10,
    active: true,
    created_at: randomDate(60)
  },
  {
    id: 'mock-plan-premium',
    name: 'Premium',
    description: 'Plan premium',
    price_monthly: 19.99,
    price_yearly: 199.99,
    max_searches_per_month: 200,
    max_saved_searches: 50,
    active: true,
    created_at: randomDate(30)
  }
]

// Générer des données pour les graphiques (30 derniers jours)
export const generateMockChartData = (baseCount: number = 10) => {
  return Array.from({ length: 30 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (29 - i))
    date.setHours(0, 0, 0, 0) // Mettre à minuit pour correspondre au backend
    return {
      date: date.toISOString(), // Format ISO complet comme le backend
      count: randomInt(Math.max(0, baseCount - 5), baseCount + 10)
    }
  }).reverse() // Inverser pour avoir les dates dans l'ordre chronologique
}

export const mockSearchStats = {
  total_searches: mockSearches.length,
  auto_check_enabled: mockSearches.filter(s => s.auto_check_enabled).length,
  recent_searches: mockSearches.filter(s => {
    const lastUsed = s.last_used ? new Date(s.last_used) : null
    if (!lastUsed) return false
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    return lastUsed > sevenDaysAgo
  }).length,
  searches_by_day: generateMockChartData(15),
  searches_by_airport: mockAirports.map(airport => ({
    airport,
    count: mockSearches.filter(s => s.departure_airport === airport).length
  }))
}

// Calculer les utilisateurs uniques pour les stats Booking SAS
const uniqueUsersFromEvents = new Set(
  mockBookingSasEvents
    .filter(e => e.user_id)
    .map(e => e.user_id)
).size

const uniqueSessionsFromEvents = new Set(
  mockBookingSasEvents
    .filter(e => e.session_id)
    .map(e => e.session_id)
).size

export const mockBookingSasStats = {
  total_clicks: mockBookingSasEvents.length,
  clicks_by_day: generateMockChartData(20),
  partner_distribution: mockPartners.reduce((acc, partner) => {
    const count = mockBookingSasEvents.filter(e => e.partner_id === partner.id).length
    acc[partner.id] = {
      name: partner.name,
      count
    }
    return acc
  }, {} as Record<string, { name: string; count: number }>),
  avg_price: Math.round(
    mockBookingSasEvents.reduce((sum, e) => sum + e.total_price, 0) / mockBookingSasEvents.length
  ),
  unique_users: uniqueUsersFromEvents,
  unique_sessions: uniqueSessionsFromEvents,
  conversion_rate: 15.5 // Taux de conversion mocké
}

