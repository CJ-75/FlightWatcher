/**
 * Shell admin — brand site (peach / Sora).
 */
import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AdminSidebar } from './components/AdminSidebar'
import { AdminHeader } from './components/AdminHeader'
import { ImpersonationBanner } from './components/ImpersonationBanner'
import { ImpersonationProvider } from './context/ImpersonationContext'
import './styles/admin.css'

function useAdminFonts() {
  useEffect(() => {
    const id = 'fw-admin-fonts'
    if (document.getElementById(id)) return
    const preconnect1 = document.createElement('link')
    preconnect1.rel = 'preconnect'
    preconnect1.href = 'https://fonts.googleapis.com'
    const preconnect2 = document.createElement('link')
    preconnect2.rel = 'preconnect'
    preconnect2.href = 'https://fonts.gstatic.com'
    preconnect2.crossOrigin = 'anonymous'
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href =
      'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Sora:wght@400;500;600;700;800&display=swap'
    document.head.append(preconnect1, preconnect2, link)
  }, [])
}

export function AdminLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  useAdminFonts()

  return (
    <ImpersonationProvider>
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
    </ImpersonationProvider>
  )
}
