/**
 * Layout principal du panneau admin - Design Dark Moderne
 */
import { Outlet } from 'react-router-dom'
import { AdminSidebar } from './components/AdminSidebar'
import { AdminHeader } from './components/AdminHeader'
import { ImpersonationBanner } from './components/ImpersonationBanner'
import { TestModeProvider } from './context/TestModeContext'

export function AdminLayout() {
  return (
    <TestModeProvider>
      <div className="min-h-screen bg-[#1a1d29] text-gray-100">
        <ImpersonationBanner />
        <div className="flex">
          <AdminSidebar />
          <div className="flex-1 flex flex-col">
            <AdminHeader />
            <main className="flex-1 p-6 bg-[#1a1d29]">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </TestModeProvider>
  )
}

