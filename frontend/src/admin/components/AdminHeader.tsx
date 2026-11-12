import { useAdminAuth } from '../hooks/useAdminAuth'

type Props = {
  onMenu: () => void
  title?: string
}

export function AdminHeader({ onMenu, title }: Props) {
  const { user } = useAdminAuth()
  return (
    <header className="fw-admin-top">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <button type="button" className="fw-menu-btn" onClick={onMenu} aria-label="Menu">
          Menu
        </button>
        <div>
          <div className="fw-display" style={{ fontWeight: 700, fontSize: '1.05rem' }}>
            {title || 'Administration'}
          </div>
          <div className="fw-muted" style={{ fontSize: '0.78rem' }}>
            Inscrits · Onboarding · Contenu
          </div>
        </div>
      </div>
      <div className="fw-muted" style={{ fontSize: '0.85rem' }}>
        {user?.email || 'Admin'}
      </div>
    </header>
  )
}
