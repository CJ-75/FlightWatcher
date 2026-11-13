import { NavLink } from 'react-router-dom'
import { prefetchAdminRoute } from '../lib/adminPreload'

type Props = {
  open: boolean
  onNavigate?: () => void
}

const GROUPS: Array<{
  label: string
  items: Array<{ to: string; label: string; ico: string; end?: boolean }>
}> = [
  {
    label: 'Pilotage',
    items: [
      { to: '/admin', label: 'Accueil', ico: 'A', end: true },
      { to: '/admin/users', label: 'Utilisateurs', ico: 'U' },
      { to: '/admin/onboarding', label: 'Onboarding', ico: 'O' },
      { to: '/admin/activite', label: 'Activité', ico: 'W' },
    ],
  },
  {
    label: 'Contenu',
    items: [
      { to: '/admin/parcours', label: 'Parcours', ico: 'P' },
      { to: '/admin/activities', label: 'Activités', ico: 'V' },
      { to: '/admin/occasions', label: 'Occasions séjours', ico: 'S' },
    ],
  },
  {
    label: 'Ops',
    items: [
      { to: '/admin/digests', label: 'Digests', ico: 'D' },
      { to: '/admin/status', label: 'Santé', ico: 'H' },
      { to: '/admin/audit', label: 'Journal', ico: 'J' },
    ],
  },
]

export function AdminSidebar({ open, onNavigate }: Props) {
  return (
    <aside className={`fw-admin-sidebar${open ? ' open' : ''}`}>
      <div className="fw-admin-brand">
        Flight<span>Watcher</span>
        <span className="fw-admin-brand-sub">Console admin</span>
      </div>
      <nav style={{ overflowY: 'auto', flex: 1 }}>
        {GROUPS.map((g) => (
          <div key={g.label}>
            <div className="fw-nav-group">{g.label}</div>
            {g.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `fw-nav-link${isActive ? ' active' : ''}`}
                onClick={onNavigate}
                onMouseEnter={() => prefetchAdminRoute(item.to)}
                onFocus={() => prefetchAdminRoute(item.to)}
              >
                <span className="fw-nav-ico" aria-hidden>
                  {item.ico}
                </span>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  )
}
