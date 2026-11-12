import { useState } from 'react'
import { adminApi } from '../api/adminApi'

type Props = {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function StepUpModal({ open, onClose, onSuccess }: Props) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await adminApi.stepUp(password)
      setPassword('')
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec step-up')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(28,25,23,0.45)',
        display: 'grid',
        placeItems: 'center',
        padding: '1rem',
      }}
    >
      <form className="fw-card" style={{ width: 'min(420px, 100%)' }} onSubmit={submit}>
        <h3 className="fw-display" style={{ margin: '0 0 0.35rem', fontSize: '1.1rem' }}>
          Confirmation sécurisée
        </h3>
        <p className="fw-muted" style={{ margin: '0 0 1rem', fontSize: '0.9rem' }}>
          Resaisis le mot de passe admin (ADMIN_PASSWORD) pour cette action.
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe admin"
          autoFocus
          style={{
            width: '100%',
            padding: '0.55rem 0.7rem',
            borderRadius: 10,
            border: '1px solid var(--fw-border)',
            marginBottom: '0.65rem',
          }}
        />
        {error ? (
          <div style={{ color: 'var(--fw-bad)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            {error}
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button type="button" className="fw-btn" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="submit" className="fw-btn fw-btn-primary" disabled={busy || !password}>
            {busy ? '…' : 'Confirmer'}
          </button>
        </div>
      </form>
    </div>
  )
}
