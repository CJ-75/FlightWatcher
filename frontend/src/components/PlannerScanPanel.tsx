import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useI18n } from '../contexts/I18nContext'

const STATUS_KEYS = [
  'planner.scan.status1',
  'planner.scan.status2',
  'planner.scan.status3',
  'planner.scan.status4',
] as const

type Props = {
  fromLabel: string
  toLabel: string
  title?: string
  className?: string
}

export function PlannerScanPanel({
  fromLabel,
  toLabel,
  title,
  className = '',
}: Props) {
  const { t } = useI18n()
  const [statusIdx, setStatusIdx] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setStatusIdx((i) => (i + 1) % STATUS_KEYS.length)
    }, 2200)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-orange-500/30 px-6 py-10 text-center shadow-soft ${className}`}
      style={{
        background:
          'linear-gradient(135deg, #1A120E 0%, #2A1A12 48%, #3D2418 100%)',
      }}
    >
      <div
        className="pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full"
        style={{ background: 'rgba(255,107,53,0.28)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-14 -right-10 h-48 w-48 rounded-full"
        style={{ background: 'rgba(255,176,136,0.16)' }}
      />

      <div className="relative z-10 space-y-5">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#FF6B35]" />
          </span>
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#FFB088]">
            Scan live
          </span>
        </div>

        <h3 className="font-extrabold text-2xl tracking-tight text-white">
          {title || t('planner.scan.auto')}
        </h3>

        <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-4">
          <div className="min-w-0 flex-1 text-left">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFB088]/75">
              Départ
            </p>
            <p className="truncate font-extrabold text-lg text-white tracking-tight">
              {fromLabel}
            </p>
          </div>

          <div className="relative h-8 w-36 shrink-0">
            <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-[#FFB088]/45" />
            <motion.div
              className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#FF6B35]"
              animate={{ scale: [0.7, 1.55], opacity: [0.45, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
            />
            <motion.span
              className="absolute top-1/2 -translate-y-1/2 text-base text-[#FFB088]"
              style={{ rotate: 90 }}
              animate={{ left: ['0%', '88%'] }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                ease: 'easeInOut',
                repeatDelay: 0.42,
              }}
            >
              ✈
            </motion.span>
          </div>

          <div className="min-w-0 flex-1 text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFB088]/75">
              Arrivée
            </p>
            <p className="truncate font-extrabold text-lg text-white tracking-tight">
              {toLabel}
            </p>
          </div>
        </div>

        <div className="min-h-[1.5rem]">
          <AnimatePresence mode="wait">
            <motion.p
              key={STATUS_KEYS[statusIdx]}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
              className="font-semibold text-[#FFE8DC]"
            >
              {t(STATUS_KEYS[statusIdx])}
            </motion.p>
          </AnimatePresence>
        </div>

        <p className="text-sm text-[#FFB088]/70">{t('planner.scan.hint')}</p>
      </div>
    </div>
  )
}
