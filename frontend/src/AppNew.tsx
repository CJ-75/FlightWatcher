/**
 * Point d'entrée principal de l'application avec router
 */
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { I18nProvider } from './contexts/I18nContext'
import { prefetchAirports } from './hooks/useAirports'

prefetchAirports()
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AuthCallback from './auth/callback'

const PlannerInvite = lazy(() => import('./pages/PlannerInvite'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Security = lazy(() => import('./pages/Security'))
const MyBookings = lazy(() => import('./pages/MyBookings'))
const MyTrip = lazy(() => import('./pages/MyTrip'))
const HotelPay = lazy(() => import('./pages/HotelPay'))
const ItinerariesPage = lazy(() => import('./pages/ItinerariesPage'))
const AdminLogin = lazy(() =>
  import('./admin/AdminLogin').then((m) => ({ default: m.AdminLogin })),
)
const AdminLayout = lazy(() =>
  import('./admin/AdminLayout').then((m) => ({ default: m.AdminLayout })),
)
const AdminRoute = lazy(() =>
  import('./admin/AdminApp').then((m) => ({ default: m.AdminRoute })),
)
const UsersPage = lazy(() =>
  import('./admin/pages/UsersPage').then((m) => ({ default: m.UsersPage })),
)
const SearchesPage = lazy(() =>
  import('./admin/pages/SearchesPage').then((m) => ({ default: m.SearchesPage })),
)
const ActivatedPage = lazy(() =>
  import('./admin/pages/ActivatedPage').then((m) => ({ default: m.ActivatedPage })),
)
const PlansPage = lazy(() =>
  import('./admin/pages/PlansPage').then((m) => ({ default: m.PlansPage })),
)
const SettingsPage = lazy(() =>
  import('./admin/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
const TestsPage = lazy(() =>
  import('./admin/pages/TestsPage').then((m) => ({ default: m.TestsPage })),
)
const DealsMetricsPage = lazy(() =>
  import('./admin/pages/DealsMetricsPage').then((m) => ({
    default: m.DealsMetricsPage,
  })),
)
const OccasionsPage = lazy(() =>
  import('./admin/pages/OccasionsPage').then((m) => ({ default: m.OccasionsPage })),
)
const ActivitiesAdminPage = lazy(() =>
  import('./admin/pages/ActivitiesAdminPage').then((m) => ({
    default: m.ActivitiesAdminPage,
  })),
)

function RouteFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center text-slate-500 text-sm font-medium">
      Chargement…
    </div>
  )
}

/** Preserve query string on legacy path aliases (e.g. /deals?deal=…). */
function LegacyRedirect({ to }: { to: string }) {
  const { search } = useLocation()
  return <Navigate to={{ pathname: to, search }} replace />
}

function App() {
  return (
    <I18nProvider>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Suspense fallback={<RouteFallback />}>
        <Routes>
        {/* Routes publiques */}
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/auth/reset-password" element={<ResetPassword />} />
        <Route path="/security" element={<Security />} />
        <Route path="/planner/invite/:token" element={<PlannerInvite />} />
        <Route path="/bookings" element={<MyBookings />} />
        <Route path="/trip/:token" element={<MyTrip />} />
        <Route path="/parcours" element={<ItinerariesPage />} />
        <Route path="/parcours/:itineraryId" element={<ItinerariesPage />} />
        <Route path="/pay/hotel" element={<HotelPay />} />
        
        {/* Routes admin */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          }
        >
          <Route index element={<Navigate to="/admin/users" replace />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="searches" element={<SearchesPage />} />
          <Route path="activated" element={<ActivatedPage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="deals" element={<DealsMetricsPage />} />
          <Route path="occasions" element={<OccasionsPage />} />
          <Route path="activities" element={<ActivitiesAdminPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="tests" element={<TestsPage />} />
        </Route>
        
        {/* App shell — onglets = vraies URLs (partage, retour navigateur, SEO) */}
        <Route path="/" element={<Navigate to="/vols" replace />} />
        <Route path="/vols" element={<Dashboard />} />
        <Route path="/sejours" element={<Dashboard />} />
        <Route path="/planner" element={<Dashboard />} />
        <Route path="/planner/:tripId" element={<Dashboard />} />
        <Route path="/activites" element={<Dashboard />} />
        <Route path="/activites/:city" element={<Dashboard />} />
        {/* /alertes gated by ALERTS_UI_ENABLED inside Dashboard (redirect → /vols when off) */}
        <Route path="/alertes" element={<Dashboard />} />
        <Route path="/favoris" element={<Dashboard />} />
        {/* Legacy aliases */}
        <Route path="/recherche" element={<LegacyRedirect to="/vols" />} />
        <Route path="/search" element={<LegacyRedirect to="/vols" />} />
        <Route path="/deals" element={<LegacyRedirect to="/sejours" />} />
        <Route path="/alerts" element={<Navigate to="/alertes" replace />} />
        <Route path="/saved" element={<Navigate to="/favoris" replace />} />
        <Route path="*" element={<Navigate to="/vols" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </I18nProvider>
  )
}

export default App
