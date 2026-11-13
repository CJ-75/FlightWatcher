import { useAdminAuth } from '../hooks/useAdminAuth'

type Props = {
  onMenu: () => void
}

export function AdminHeader({ onMenu }: Props) {
  const { user } = useAdminAuth()
  return (
    <header className="fw-admin-top">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button type="button" className="fw-menu-btn" onClick={onMenu} aria-label="Ouvrir le menu">
          Menu
        </button>
        <div>
          <div className="fw-display" style={{ fontSize: '1.25rem', lineHeight: 1.1 }}>
            Administration
          </div>
          <div className="fw-muted" style={{ fontSize: '0.75rem', fontWeight: 500 }}>
            Pilotage · contenu · ops
          </div>
        </div>
      </div>
      <div className="fw-pill">
        {user?.email === 'admin@env' ? 'Session admin' : user?.email || 'Admin'}
      </div>
    </header>
  )
}
