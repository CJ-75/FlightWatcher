import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DealsTab } from '../DealsTab'
import { ParcoursCatalog } from './ParcoursCatalog'

type Segment = 'parcours' | 'sejours'

/**
 * Onglet Parcours — segments §5 : Parcours | Séjours pas chers.
 */
export function ParcoursHub() {
  const [params, setParams] = useSearchParams()
  const fromUrl = params.get('vue')
  const [segment, setSegment] = useState<Segment>(() =>
    fromUrl === 'sejours' ? 'sejours' : 'parcours',
  )

  useEffect(() => {
    if (fromUrl === 'sejours' || fromUrl === 'parcours') {
      setSegment(fromUrl)
    }
  }, [fromUrl])

  const select = (next: Segment) => {
    setSegment(next)
    const nextParams = new URLSearchParams(params)
    if (next === 'parcours') nextParams.delete('vue')
    else nextParams.set('vue', 'sejours')
    setParams(nextParams, { replace: true })
  }

  return (
    <div className="w-full">
      <div className="mb-5 flex w-full max-w-md rounded-full bg-white/80 p-1 border border-line shadow-sm">
        {(
          [
            { id: 'parcours' as const, label: 'Parcours' },
            { id: 'sejours' as const, label: 'Séjours pas chers' },
          ] as const
        ).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => select(s.id)}
            className={`flex-1 rounded-full px-3 py-2.5 text-sm font-bold transition-colors ${
              segment === s.id
                ? 'bg-[color:var(--fw-primary)] text-[color:var(--fw-primary-fg)] shadow'
                : 'text-muted hover:text-ink'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {segment === 'parcours' ? (
        <ParcoursCatalog active />
      ) : (
        <DealsTab />
      )}
    </div>
  )
}
