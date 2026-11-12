/**
 * Admin shell — product light theme, responsive drawer (no test/mocks).
 */
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AdminSidebar } from './components/AdminSidebar'
import { AdminHeader } from './components/AdminHeader'
import { ImpersonationBanner } from './components/ImpersonationBanner'
import './styles/admin.css'

export function AdminLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="fw-admin">
      <ImpersonationBanner />
      {drawerOpen ? (
        <div className="fw-drawer-backdrop" onClick={() => setDrawerOpen(false)} />
      ) : null}
      <div className="fw-admin-shell">
        <AdminSidebar open={drawerOpen} onNavigate={() => setDrawerOpen(false)} />
        <div className="fw-admin-main">
          <AdminHeader onMenu={() => setDrawerOpen((v) => !v)} />
          <main className="fw-admin-content">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
