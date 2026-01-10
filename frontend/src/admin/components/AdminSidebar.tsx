/**
 * Menu latéral de navigation admin - Design Dark Moderne
 */
import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'

const menuItems = [
  { path: '/admin/users', label: 'Users', icon: '👥' },
  { path: '/admin/searches', label: 'Searches', icon: '🔍' },
  { path: '/admin/activated', label: 'Activated', icon: '📊' },
  { path: '/admin/plans', label: 'Plans', icon: '💳' },
  { path: '/admin/settings', label: 'Settings', icon: '⚙️' },
  { path: '/admin/tests', label: 'Tests', icon: '🧪' }
]

export function AdminSidebar() {
  return (
    <aside className="w-64 bg-[#252836] text-gray-100 min-h-screen border-r border-gray-700">
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-lg">F</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-300">FlightWatcher</h2>
            <p className="text-xs text-gray-500">Admin Panel</p>
          </div>
        </div>
      </div>
      <nav className="p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 px-4">
          Manage
        </p>
        <ul className="space-y-1">
          {menuItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                      : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'
                  }`
                }
              >
                <span className="text-xl">{item.icon}</span>
                <span className="font-medium text-sm">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}

