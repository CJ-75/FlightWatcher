import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DealsTab } from '../DealsTab'
import { FwKicker } from '../ui/FwKicker'
import { ParcoursCatalog } from './ParcoursCatalog'

type Segment = 'parcours' | 'sejours'

/**
 * Titre statique + tabs style TikTok sous le titre, puis contenu.
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
      <header className="mb-5 lg:mb-7 lg:flex lg:items-end lg:justify-between lg:gap-8">
        <div className="min-w-0">
          <div className="mb-1.5">
            <FwKicker>Parcours</FwKicker>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-ink tracking-tight">
            Où aller, quoi faire
          </h2>
          <p className="app-subtitle mt-1.5 max-w-xl lg:max-w-2xl lg:text-[15px]">
            Des balades et des week-ends choisis pour toi.
          </p>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Parcours ou séjours"
        className="mb-5 lg:mb-7 flex w-full gap-5 lg:gap-8 border-b border-line"
      >
        {(
          [
            { id: 'parcours' as const, label: 'Parcours' },
            { id: 'sejours' as const, label: 'Séjours pas chers' },
          ] as const
        ).map((s) => {
          const on = segment === s.id
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => select(s.id)}
              className={`relative pb-3 lg:pb-3.5 text-sm lg:text-[15px] font-bold tracking-tight transition-colors ${
                on ? 'text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {s.label}
              {on ? (
                <span className="absolute inset-x-0 -bottom-px h-[2.5px] rounded-full bg-ink" />
              ) : null}
            </button>
          )
        })}
      </div>

      {/* Keep both mounted — instant tab switch + preload. */}
      <div className={segment === 'parcours' ? 'block' : 'hidden'} aria-hidden={segment !== 'parcours'}>
        <ParcoursCatalog active={segment === 'parcours'} embedded />
      </div>
      <div className={segment === 'sejours' ? 'block' : 'hidden'} aria-hidden={segment !== 'sejours'}>
        <DealsTab embedded />
      </div>
    </div>
  )
}
