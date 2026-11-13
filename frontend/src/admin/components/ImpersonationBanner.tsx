/**
 * Bannière Log as active.
 */
import { useImpersonationContext } from '../context/ImpersonationContext'

export function ImpersonationBanner() {
  const {
    isImpersonating,
    targetUserEmail,
    stopImpersonation,
    reopenLink,
    actionLink,
  } = useImpersonationContext()

  if (!isImpersonating) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        flexWrap: 'wrap',
        padding: '0.7rem 1.25rem',
        background: 'rgba(180, 83, 9, 0.12)',
        borderBottom: '1px solid rgba(180, 83, 9, 0.28)',
        color: '#92400e',
        fontSize: '0.88rem',
        fontWeight: 600,
      }}
    >
      <span>
        Log as actif :{' '}
        <span style={{ color: 'var(--fw-ink)' }}>{targetUserEmail || 'utilisateur'}</span>
      </span>
      <div style={{ display: 'flex', gap: '0.45rem' }}>
        {actionLink ? (
          <button type="button" className="fw-btn" onClick={reopenLink}>
            Rouvrir l’app
          </button>
        ) : null}
        <button
          type="button"
          className="fw-btn fw-btn-primary"
          onClick={() => void stopImpersonation()}
        >
          Terminer
        </button>
      </div>
    </div>
  )
}
