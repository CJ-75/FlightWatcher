/**
 * Hero CTA Activités — voyage en cours (photo ville) ou empty state.
 */
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ACTIVITY_NO_TRIP_CTA_BODY_FR,
  ACTIVITY_NO_TRIP_CTA_BUTTON_FR,
  ACTIVITY_NO_TRIP_CTA_TITLE_FR,
  ACTIVITY_OPEN_PLANNER_FR,
  ACTIVITY_SYNC_CITY_FR,
  ACTIVITY_TRIP_HERO_KICKER_FR,
  ACTIVITY_TRIP_IN_PROGRESS_HINT_FR,
  ACTIVITY_TRIP_PLANNER_COUNT_FR,
  cityImageUrl,
} from '@flightwatcher/shared'

const spring = {
  type: 'spring' as const,
  stiffness: 360,
  damping: 28,
  mass: 0.55,
}

type ActiveProps = {
  mode: 'active'
  cityLabel: string
  imageCity?: string
  plannerCount: number
  plannerHref: string
  showSyncCity?: boolean
  onSyncCity?: () => void
}

type EmptyProps = {
  mode: 'empty'
  emptyHref?: string
}

type Props = ActiveProps | EmptyProps

export function ActivityTripHero(props: Props) {
  if (props.mode === 'empty') {
    const href = props.emptyHref || '/sejours'
    const imageUrl = cityImageUrl(null)
    return (
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className="relative mb-5 sm:mb-6 overflow-hidden rounded-3xl border border-line shadow-soft min-h-[168px] sm:min-h-[188px]"
      >
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center scale-105"
          loading="lazy"
          decoding="async"
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-br from-ink/80 via-ink/55 to-primary-900/45" />
        <div className="relative z-[1] flex h-full min-h-[168px] sm:min-h-[188px] flex-col justify-end gap-4 p-5 sm:p-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 max-w-xl">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/75 mb-2">
              Activités + séjour
            </p>
            <h3 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight leading-tight">
              {ACTIVITY_NO_TRIP_CTA_TITLE_FR}
            </h3>
            <p className="mt-1.5 text-sm text-white/80 leading-snug">
              {ACTIVITY_NO_TRIP_CTA_BODY_FR}
            </p>
          </div>
          <Link
            to={href}
            className="shrink-0 inline-flex items-center justify-center rounded-2xl bg-white text-ink px-5 py-3 text-sm font-extrabold shadow-lg hover:bg-white/95 min-h-[48px] transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            {ACTIVITY_NO_TRIP_CTA_BUTTON_FR}
          </Link>
        </div>
      </motion.div>
    )
  }

  const {
    cityLabel,
    imageCity,
    plannerCount,
    plannerHref,
    showSyncCity,
    onSyncCity,
  } = props
  const imageUrl = cityImageUrl(imageCity || cityLabel)

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={spring}
      className="relative mb-5 sm:mb-6 overflow-hidden rounded-3xl border border-white/10 shadow-lift min-h-[200px] sm:min-h-[220px] group"
    >
      <img
        src={imageUrl}
        alt={cityLabel}
        className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105"
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/20" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-primary-600/20" />

      <div className="relative z-[1] flex h-full min-h-[200px] sm:min-h-[220px] flex-col justify-between p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-white">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
            {ACTIVITY_TRIP_HERO_KICKER_FR}
          </span>
          <span className="inline-flex items-center rounded-full bg-black/35 backdrop-blur-md border border-white/10 px-3 py-1 text-[11px] font-bold text-white/90">
            {ACTIVITY_TRIP_PLANNER_COUNT_FR(plannerCount)}
          </span>
        </div>

        <div className="mt-auto pt-8 sm:pt-10">
          <h3 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight drop-shadow-sm">
            {cityLabel}
          </h3>
          <p className="mt-1.5 max-w-lg text-sm sm:text-[15px] text-white/85 leading-snug">
            {ACTIVITY_TRIP_IN_PROGRESS_HINT_FR}
          </p>

          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link
              to={plannerHref}
              className="inline-flex items-center justify-center rounded-2xl bg-white text-ink px-5 py-3 text-sm font-extrabold shadow-lg hover:bg-white/95 min-h-[48px] transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {ACTIVITY_OPEN_PLANNER_FR}
            </Link>
            {showSyncCity && onSyncCity ? (
              <button
                type="button"
                onClick={onSyncCity}
                className="inline-flex items-center justify-center rounded-2xl bg-white/12 backdrop-blur-md border border-white/25 text-white px-4.5 py-3 text-sm font-bold hover:bg-white/20 min-h-[48px] transition-colors"
              >
                {ACTIVITY_SYNC_CITY_FR(cityLabel)}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
