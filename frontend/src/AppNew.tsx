/**
 * Point d'entrée principal de l'application avec router
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AuthCallback from './auth/callback'
import { AdminLogin } from './admin/AdminLogin'
import { AdminLayout } from './admin/AdminLayout'
import { AdminRoute } from './admin/AdminApp'
import { UsersPage } from './admin/pages/UsersPage'
import { SearchesPage } from './admin/pages/SearchesPage'
import { ActivatedPage } from './admin/pages/ActivatedPage'
import { PlansPage } from './admin/pages/PlansPage'
import { SettingsPage } from './admin/pages/SettingsPage'
import { TestsPage } from './admin/pages/TestsPage'

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <Routes>
        {/* Routes publiques */}
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        
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
          <Route path="settings" element={<SettingsPage />} />
          <Route path="tests" element={<TestsPage />} />
        </Route>
        
        {/* Route principale */}
        <Route path="/" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

