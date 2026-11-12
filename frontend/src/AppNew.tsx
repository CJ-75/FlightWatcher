/**
 * Point d'entrée principal de l'application avec router
 */
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { I18nProvider } from './contexts/I18nContext'
import { prefetchAirports } from './hooks/useAirports'
import { AuthSheetHost } from './components/onboarding/AuthSheetHost'
import { configureOnboardingKv } from '@flightwatcher/shared'

configureOnboardingKv({
  getItem: (k) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* ignore */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  },
})

prefetchAirports()
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AuthCallback from './auth/callback'

const PlannerInvite = lazy(() => import('./pages/PlannerInvite'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Security = lazy(() => import('./pages/Security'))
const Legal = lazy(() => import('./pages/Legal'))
const MyBookings = lazy(() => import('./pages/MyBookings'))
const MyTrip = lazy(() => import('./pages/MyTrip'))
const HotelPay = lazy(() => import('./pages/HotelPay'))
const ItinerariesPage = lazy(() => import('./pages/ItinerariesPage'))
const ParcoursPublicPage = lazy(() => import('./pages/ParcoursPublicPage'))
const NotFound = lazy(() => import('./pages/NotFound'))
// Admin shell eager — Accueil / login sans waterfall
import { AdminLogin } from './admin/AdminLogin'
import { AdminLayout } from './admin/AdminLayout'
import { AdminRoute } from './admin/AdminApp'
import { OverviewPage } from './admin/pages/OverviewPage'
const UsersCsmPage = lazy(() =>
  import('./admin/pages/UsersCsmPage').then((m) => ({ default: m.UsersCsmPage })),
)
const OccasionsPage = lazy(() =>
  import('./admin/pages/OccasionsPage').then((m) => ({ default: m.OccasionsPage })),
)
const ActivitiesAdminPage = lazy(() =>
  import('./admin/pages/ActivitiesAdminPage').then((m) => ({
    default: m.ActivitiesAdminPage,
  })),
)
const ParcoursAdminPage = lazy(() =>
  import('./admin/pages/ParcoursAdminPage').then((m) => ({
    default: m.ParcoursAdminPage,
  })),
)
const ParcoursEditorPage = lazy(() =>
  import('./admin/pages/ParcoursEditorPage').then((m) => ({
    default: m.ParcoursEditorPage,
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
        <AuthSheetHost>
        <Toaster position="top-right" />
        <Suspense fallback={<RouteFallback />}>
        <Routes>
        {/* Routes publiques */}
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/auth/reset-password" element={<ResetPassword />} />
        <Route path="/security" element={<Security />} />
        <Route path="/privacy" element={<Legal />} />
        <Route path="/confidentialite" element={<Legal />} />
        <Route path="/terms" element={<Legal />} />
        <Route path="/cgu" element={<Legal />} />
        <Route path="/legal" element={<Legal />} />
        <Route path="/mentions-legales" element={<Legal />} />
        <Route path="/planner/invite/:token" element={<PlannerInvite />} />
        <Route path="/bookings" element={<MyBookings />} />
        <Route path="/trip/:token" element={<MyTrip />} />
        <Route path="/parcours" element={<ItinerariesPage />} />
        <Route
          path="/parcours/:itineraryId"
          element={<ParcoursPublicPage />}
        />
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
          <Route index element={<OverviewPage />} />
          <Route path="users" element={<UsersCsmPage />} />
          <Route path="occasions" element={<OccasionsPage />} />
          <Route path="activities" element={<ActivitiesAdminPage />} />
          <Route path="parcours" element={<ParcoursAdminPage />} />
          <Route path="parcours/:itineraryId" element={<ParcoursEditorPage />} />
          {/* Anciennes URLs admin → Accueil */}
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
        
        {/* App shell — onglets = vraies URLs (partage, retour navigateur, SEO) */}
        <Route path="/" element={<Navigate to="/sejours" replace />} />
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
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </AuthSheetHost>
      </BrowserRouter>
    </I18nProvider>
  )
}

export default App
