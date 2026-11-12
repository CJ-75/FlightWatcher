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
          <div className="fw-display" style={{ fontWeight: 700, fontSize: '1rem' }}>
            Administration
          </div>
          <div className="fw-muted" style={{ fontSize: '0.78rem' }}>
            Inscrits · onboarding · contenu
          </div>
        </div>
      </div>
      <div
        style={{
          fontSize: '0.82rem',
          fontWeight: 600,
          color: 'var(--fw-muted)',
          padding: '0.35rem 0.7rem',
          borderRadius: 999,
          background: 'rgba(15,118,110,0.08)',
        }}
      >
        {user?.email === 'admin@env' ? 'Session admin' : user?.email || 'Admin'}
      </div>
    </header>
  )
}
