import { NavLink } from 'react-router-dom'

type Props = {
  open: boolean
  onNavigate?: () => void
}

const GROUPS: Array<{ label: string; items: Array<{ to: string; label: string; end?: boolean }> }> = [
  {
    label: 'Pilotage',
    items: [
      { to: '/admin', label: 'Accueil', end: true },
      { to: '/admin/users', label: 'Utilisateurs' },
    ],
  },
  {
    label: 'Contenu',
    items: [
      { to: '/admin/parcours', label: 'Parcours' },
      { to: '/admin/activities', label: 'Activités' },
      { to: '/admin/occasions', label: 'Occasions' },
    ],
  },
]

export function AdminSidebar({ open, onNavigate }: Props) {
  return (
    <aside className={`fw-admin-sidebar${open ? ' open' : ''}`}>
      <div className="fw-admin-brand">
        Flight<span>Watcher</span>
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
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  )
}
