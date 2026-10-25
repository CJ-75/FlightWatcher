import { motion, AnimatePresence } from 'framer-motion'
import type { DealOccasionChip } from '../types'
import { useI18n } from '../contexts/I18nContext'
import { OccasionIcon } from './OccasionIcon'

type Props = {
  chips: DealOccasionChip[]
  selected: string | null
  onToggle: (slug: string) => void
  onClear: () => void
  /** Counts still loading from API */
  countsPending?: boolean
}

/**
 * Web: full labels (no truncate).
 * Mobile: slightly shorter where the official label is long.
 */
const CHIP_MOBILE_SHORT: Record<string, string> = {
  'sans-conge': 'Sans congé',
  'un-jour-conge': '1 j. de congé',
  'hotel-plebiscite': 'Coup de cœur',
  'extras-offerts': 'Petit-déj',
  'hors-vacances': 'Hors vacances',
  'ambiance-noel': 'Marchés de Noël',
  'pont-noel': 'Pont de Noël',
  'nouvel-an': 'Nouvel An',
  'hiver-soleil': 'Soleil d’hiver',
}

function chipLabel(chip: DealOccasionChip, compact: boolean): string {
  if (compact && CHIP_MOBILE_SHORT[chip.slug]) return CHIP_MOBILE_SHORT[chip.slug]
  return chip.label || CHIP_MOBILE_SHORT[chip.slug] || chip.slug
}

export function OccasionRail({
  chips,
  selected,
  onToggle,
  onClear,
  countsPending = false,
}: Props) {
  const { t } = useI18n()
  const active = chips.find((c) => c.slug === selected) || null

  if (chips.length === 0) return null

  return (
    <section className="mb-4" aria-label={t('deals.occasionsTitle')}>
      <div className="flex items-center justify-between gap-3 mb-2 px-0.5">
        <p className="text-xs font-extrabold uppercase tracking-wider text-ink-soft">
          {t('deals.occasionsKicker')}
        </p>
        {selected ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-bold text-primary-600 hover:text-primary-700 shrink-0"
          >
            {t('deals.occasionsClear')}
          </button>
        ) : null}
      </div>

      {/* Mobile: horizontal scroll. Desktop: wrap — never clip chip text. */}
      <div className="max-md:-mx-1 max-md:px-1 max-md:overflow-x-auto max-md:[scrollbar-width:none] max-md:[-ms-overflow-style:none] max-md:[&::-webkit-scrollbar]:hidden">
        <div className="flex max-md:items-center max-md:gap-2 max-md:min-w-min max-md:pb-0.5 md:flex-wrap md:gap-2">
          {chips.map((chip, i) => {
            const on = selected === chip.slug
            const count = chip.count
            const hasCount = typeof count === 'number'
            const emptyKnown = hasCount && count <= 0
            return (
              <motion.button
                key={chip.slug}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: emptyKnown && !on ? 0.45 : 1, y: 0 }}
                transition={{
                  delay: Math.min(i * 0.03, 0.18),
                  type: 'spring',
                  stiffness: 400,
                  damping: 28,
                }}
                onClick={() => onToggle(chip.slug)}
                disabled={emptyKnown && !on}
                aria-pressed={on}
                title={chip.explain || chip.label || undefined}
                className={`inline-flex items-center gap-1.5 shrink-0 rounded-full border px-3 py-1.5 text-left transition-all duration-150 ${
                  on
                    ? 'bg-primary-500 border-primary-500 text-white shadow-soft'
                    : 'bg-white text-ink border-line hover:border-primary-200'
                }`}
              >
                <OccasionIcon icon={chip.icon} slug={chip.slug} size={14} />
                <span
                  className={`text-[12px] font-bold whitespace-nowrap md:hidden ${
                    on ? 'text-white' : 'text-ink'
                  }`}
                >
                  {chipLabel(chip, true)}
                </span>
                <span
                  className={`text-[12px] font-bold whitespace-nowrap hidden md:inline ${
                    on ? 'text-white' : 'text-ink'
                  }`}
                >
                  {chipLabel(chip, false)}
                </span>
                <span
                  className={`inline-flex min-w-[1.25rem] justify-center text-[10px] font-bold tabular-nums rounded-full px-1.5 py-0.5 leading-none shrink-0 ${
                    on
                      ? 'bg-white/20 text-white'
                      : 'bg-primary-50 text-primary-700'
                  }`}
                  aria-hidden={!hasCount}
                >
                  {hasCount ? (
                    count
                  ) : countsPending ? (
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-current/30 animate-pulse" />
                  ) : (
                    '·'
                  )}
                </span>
              </motion.button>
            )
          })}
        </div>
      </div>

      <AnimatePresence>
        {active?.explain ? (
          <motion.p
            key={active.slug}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 text-xs text-muted px-0.5"
          >
            {active.explain}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </section>
  )
}
