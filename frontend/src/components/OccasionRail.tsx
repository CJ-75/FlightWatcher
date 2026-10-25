import { motion, AnimatePresence } from 'framer-motion'
import type { DealOccasionChip } from '../types'
import { useI18n } from '../contexts/I18nContext'
import { OccasionIcon } from './OccasionIcon'

type Props = {
  chips: DealOccasionChip[]
  selected: string | null
  onToggle: (slug: string) => void
  onClear: () => void
}

export function OccasionRail({ chips, selected, onToggle, onClear }: Props) {
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

      <div className="-mx-1 px-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center gap-2 min-w-min pb-0.5">
          {chips.map((chip, i) => {
            const on = selected === chip.slug
            const count = chip.count
            return (
              <motion.button
                key={chip.slug}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: Math.min(i * 0.03, 0.18),
                  type: 'spring',
                  stiffness: 400,
                  damping: 28,
                }}
                onClick={() => onToggle(chip.slug)}
                aria-pressed={on}
                title={chip.explain || undefined}
                className={`inline-flex items-center gap-1.5 shrink-0 rounded-full border px-3 py-1.5 text-left transition-all duration-150 max-w-[11rem] ${
                  on
                    ? 'bg-primary-500 border-primary-500 text-white shadow-soft'
                    : 'bg-white text-ink border-line hover:border-primary-200'
                }`}
              >
                <OccasionIcon icon={chip.icon} slug={chip.slug} size={14} />
                <span className={`text-[12px] font-bold truncate ${on ? 'text-white' : 'text-ink'}`}>
                  {chip.label || chip.slug}
                </span>
                {typeof count === 'number' && count > 0 ? (
                  <span
                    className={`text-[10px] font-bold tabular-nums ${
                      on ? 'text-white/80' : 'text-muted'
                    }`}
                  >
                    {count}
                  </span>
                ) : null}
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
