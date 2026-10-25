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
    <section className="mb-5" aria-label={t('deals.occasionsTitle')}>
      <div className="flex items-end justify-between gap-3 mb-2.5 px-0.5">
        <div>
          <p className="app-kicker mb-0.5">{t('deals.occasionsKicker')}</p>
          <h3 className="text-[15px] sm:text-base font-extrabold text-ink tracking-tight">
            {t('deals.occasionsTitle')}
          </h3>
        </div>
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
        <div className="flex items-stretch gap-2.5 min-w-min pb-1">
          {chips.map((chip, i) => {
            const on = selected === chip.slug
            return (
              <motion.button
                key={chip.slug}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: Math.min(i * 0.035, 0.2),
                  type: 'spring',
                  stiffness: 380,
                  damping: 28,
                }}
                onClick={() => onToggle(chip.slug)}
                aria-pressed={on}
                title={chip.explain || undefined}
                className={`group relative flex flex-col items-start gap-2 shrink-0 rounded-[1.15rem] border px-3.5 py-3 text-left transition-all duration-200 w-[8.25rem] sm:w-[9rem] ${
                  on
                    ? 'bg-gradient-to-br from-primary-500 to-primary-600 border-primary-500 text-white shadow-soft ring-2 ring-primary-200/60'
                    : 'bg-white text-ink border-line hover:border-primary-200 hover:shadow-soft'
                }`}
              >
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                    on
                      ? 'bg-white/20 text-white'
                      : 'bg-primary-50 text-primary-600 group-hover:bg-primary-100'
                  }`}
                  aria-hidden
                >
                  <OccasionIcon icon={chip.icon} slug={chip.slug} size={18} />
                </span>
                <span
                  className={`text-[12.5px] font-extrabold leading-snug tracking-tight line-clamp-2 min-h-[2.4em] ${
                    on ? 'text-white' : 'text-ink'
                  }`}
                >
                  {chip.label || chip.slug}
                </span>
                {typeof chip.count === 'number' && chip.count > 0 ? (
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                      on
                        ? 'bg-white/20 text-white'
                        : 'bg-canvas text-muted border border-line'
                    }`}
                  >
                    {chip.count}{' '}
                    {chip.count > 1
                      ? t('deals.occasionsDeals')
                      : t('deals.occasionsDeal')}
                  </span>
                ) : null}
              </motion.button>
            )
          })}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {active?.explain ? (
          <motion.div
            key={active.slug}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-2xl bg-primary-50/90 border border-primary-100 px-3.5 py-3 flex gap-3 items-start">
              <span
                className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white border border-primary-100 text-primary-600 shadow-soft"
                aria-hidden
              >
                <OccasionIcon icon={active.icon} slug={active.slug} size={16} />
              </span>
              <p className="text-[12.5px] text-ink/80 leading-snug min-w-0 pt-0.5">
                <span className="font-extrabold text-ink">{active.label}</span>
                <span className="text-muted"> — </span>
                {active.explain}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  )
}
