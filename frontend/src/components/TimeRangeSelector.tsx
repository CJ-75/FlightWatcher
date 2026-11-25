import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TIME_PRESETS, type DateAvecHoraire } from '@waypop/shared'

interface TimeRangeSelectorProps {
  day: string
  slots: DateAvecHoraire[]
  onCommit: (slots: DateAvecHoraire[]) => void
  type: 'depart' | 'retour'
}

const springConfig = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5,
}

const FIXED = TIME_PRESETS.filter((p) => p.id !== 'journee')
const JOURNEE = TIME_PRESETS.find((p) => p.id === 'journee')!

function presetIdForSlot(slot: DateAvecHoraire): string | null {
  const min = slot.heure_min || '06:00'
  const max = slot.heure_max || '12:00'
  return FIXED.find((p) => p.min === min && p.max === max)?.id ?? null
}

function slotsFromIds(day: string, ids: string[]): DateAvecHoraire[] {
  return FIXED.filter((p) => ids.includes(p.id)).map((p) => ({
    date: day,
    heure_min: p.min,
    heure_max: p.max,
  }))
}

function summarize(slots: DateAvecHoraire[]): string {
  if (!slots.length) return 'Aucun créneau'
  return slots
    .map((s) => {
      const id = presetIdForSlot(s)
      const p = id ? FIXED.find((x) => x.id === id) : null
      return p ? `${p.emoji} ${p.label}` : `${s.heure_min} → ${s.heure_max}`
    })
    .join(' · ')
}

export function TimeRangeSelector({
  day,
  slots,
  onCommit,
  type,
}: TimeRangeSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const selectedIds = useMemo(() => {
    const ids = slots
      .map(presetIdForSlot)
      .filter((id): id is string => Boolean(id))
    return [...new Set(ids)]
  }, [slots])
  const customOnly =
    slots.length > 0 && slots.every((s) => !presetIdForSlot(s))
  const customSlot = customOnly ? slots[0] : null

  const togglePreset = (id: string) => {
    const has = selectedIds.includes(id)
    let next = has ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    if (!next.length) next = [id]
    onCommit(slotsFromIds(day, next))
  }

  const applyCustom = (field: 'heure_min' | 'heure_max', value: string) => {
    const base = customSlot || {
      date: day,
      heure_min: JOURNEE.min,
      heure_max: JOURNEE.max,
    }
    onCommit([{ ...base, date: day, [field]: value }])
  }

  return (
    <div className="relative">
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={`w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-sm min-h-[48px] sm:min-h-[52px]
          ${
            type === 'depart'
              ? 'bg-gradient-to-r from-primary-100 to-primary-200 text-primary-900 hover:from-primary-200 hover:to-primary-300 border-2 border-primary-300 active:scale-95'
              : 'bg-gradient-to-r from-emerald-100 to-emerald-200 text-emerald-900 hover:from-emerald-200 hover:to-emerald-300 border-2 border-emerald-300 active:scale-95'
          }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col items-start text-left min-w-0">
            <span className="text-xs opacity-75">
              {slots.length > 1
                ? `${slots.length} créneaux`
                : 'Horaires'}
            </span>
            <span className="font-mono text-sm truncate max-w-full">
              {summarize(slots)}
            </span>
          </div>
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={springConfig}
            className="text-xl font-bold shrink-0"
          >
            ▼
          </motion.span>
        </div>
      </motion.button>

      <AnimatePresence>
        {isExpanded && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExpanded(false)}
              className="hidden md:block fixed inset-0 bg-transparent z-[99]"
            />

            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={springConfig}
              onClick={(e) => e.stopPropagation()}
              className="absolute z-[100] bottom-full mb-2 left-0 right-0 md:left-auto md:right-0 w-full md:w-[360px] bg-white rounded-2xl shadow-lift border border-line p-3 sm:p-4 space-y-3 sm:space-y-4"
            >
              <div className="text-sm font-black text-slate-900 mb-1 flex items-center justify-between gap-2">
                <div className="flex flex-col items-start gap-0.5">
                  <span>Créneaux (multi)</span>
                  <span className="text-xs font-medium text-slate-500">
                    Chaque option ajoute la date avec ses heures
                  </span>
                </div>
                <motion.button
                  onClick={() => setIsExpanded(false)}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="md:hidden w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors"
                  aria-label="Fermer"
                >
                  <span className="text-lg font-bold">×</span>
                </motion.button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {FIXED.map((preset) => {
                  const active = selectedIds.includes(preset.id) && !customOnly
                  return (
                    <motion.button
                      key={preset.id}
                      onClick={() => togglePreset(preset.id)}
                      whileHover={{ scale: 1.03, y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      className={`px-2 sm:px-3 py-2.5 sm:py-3 rounded-xl text-xs font-bold transition-all min-h-[52px] md:min-h-[56px] border-2 ${
                        active
                          ? 'bg-primary-500 text-white border-primary-600 shadow-lg'
                          : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-primary-300'
                      }`}
                    >
                      <div className="text-base mb-1">{preset.emoji}</div>
                      <div>{preset.label}</div>
                      <div className="text-xs opacity-80 font-mono mt-0.5">
                        {preset.min} - {preset.max}
                      </div>
                    </motion.button>
                  )
                })}
              </div>

              <div className="border-t-2 border-slate-200 pt-4 mt-2">
                <div className="text-sm font-black text-slate-900 mb-3">
                  Horaires personnalisés
                </div>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-slate-600 mb-2 block">
                      De
                    </label>
                    <input
                      type="time"
                      value={customSlot?.heure_min || JOURNEE.min}
                      onChange={(e) => applyCustom('heure_min', e.target.value)}
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-slate-300 rounded-xl focus:border-primary-500 focus:ring-4 focus:ring-primary-200 text-sm sm:text-base font-mono font-bold transition-all min-h-[44px]"
                    />
                  </div>
                  <div className="pb-2 text-2xl text-slate-400 font-black">→</div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-slate-600 mb-2 block">
                      À
                    </label>
                    <input
                      type="time"
                      value={customSlot?.heure_max || JOURNEE.max}
                      onChange={(e) => applyCustom('heure_max', e.target.value)}
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-slate-300 rounded-xl focus:border-primary-500 focus:ring-4 focus:ring-primary-200 text-sm sm:text-base font-mono font-bold transition-all min-h-[44px]"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
