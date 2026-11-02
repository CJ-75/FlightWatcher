/**
 * Hero CTA Activités — voyage en cours (photo ville) ou empty state.
 */
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ACTIVITY_CHANGE_TRIP_FR,
  ACTIVITY_CHOOSE_TRIP_FR,
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

/** Chevron bas (chapeau) — ouvre le choix de séjour. */
function ChevronDownIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M2.1 4.2L6 8.2l3.9-4"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

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
  onChangeTrip?: () => void
}

type EmptyProps = {
  mode: 'empty'
  emptyHref?: string
  onChooseTrip?: () => void
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
        className="relative mb-4 sm:mb-5 overflow-hidden rounded-2xl border border-line shadow-soft min-h-[140px] sm:min-h-[156px]"
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
        <div className="relative z-[1] flex h-full min-h-[140px] sm:min-h-[156px] flex-col justify-end gap-3 p-4 sm:p-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 max-w-xl">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/75 mb-1.5">
              Activités + séjour
            </p>
            <h3 className="text-base sm:text-lg font-extrabold text-white tracking-tight leading-tight">
              {ACTIVITY_NO_TRIP_CTA_TITLE_FR}
            </h3>
            <p className="mt-1 text-xs text-white/80 leading-snug">
              {ACTIVITY_NO_TRIP_CTA_BODY_FR}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {props.onChooseTrip ? (
              <button
                type="button"
                onClick={props.onChooseTrip}
                className="inline-flex items-center justify-center rounded-xl bg-white text-ink px-4 py-2.5 text-xs font-extrabold shadow-lg hover:bg-white/95 min-h-[40px] transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {ACTIVITY_CHOOSE_TRIP_FR}
              </button>
            ) : null}
            <Link
              to={href}
              className="inline-flex items-center justify-center rounded-xl bg-white/12 backdrop-blur-md border border-white/25 text-white px-3.5 py-2.5 text-xs font-bold hover:bg-white/20 min-h-[40px]"
            >
              {ACTIVITY_NO_TRIP_CTA_BUTTON_FR}
            </Link>
          </div>
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
    onChangeTrip,
  } = props
  const imageUrl = cityImageUrl(imageCity || cityLabel)

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={spring}
      className="relative mb-4 sm:mb-5 overflow-hidden rounded-2xl border border-white/10 shadow-lift min-h-[160px] sm:min-h-[176px] group"
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

      <div className="relative z-[1] flex h-full min-h-[160px] sm:min-h-[176px] flex-col justify-between p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
            {ACTIVITY_TRIP_HERO_KICKER_FR}
          </span>
          <span className="shrink-0 inline-flex items-center rounded-full bg-black/35 backdrop-blur-md border border-white/10 px-2.5 py-0.5 text-[10px] font-bold text-white/90">
            {ACTIVITY_TRIP_PLANNER_COUNT_FR(plannerCount)}
          </span>
        </div>

        <div className="mt-auto pt-6 sm:pt-8">
          {onChangeTrip ? (
            <button
              type="button"
              onClick={onChangeTrip}
              aria-label={ACTIVITY_CHOOSE_TRIP_FR}
              className="group/title inline-flex items-center gap-2 max-w-full text-left"
            >
              <h3 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight drop-shadow-sm truncate">
                {cityLabel}
              </h3>
              <span className="shrink-0 inline-flex items-center justify-center rounded-full bg-white text-ink shadow-md w-7 h-7 group-hover/title:bg-white/95 group-hover/title:scale-105 transition-transform">
                <ChevronDownIcon />
              </span>
            </button>
          ) : (
            <h3 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight drop-shadow-sm">
              {cityLabel}
            </h3>
          )}
          <p className="mt-1 max-w-lg text-xs sm:text-sm text-white/85 leading-snug">
            {ACTIVITY_TRIP_IN_PROGRESS_HINT_FR}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to={plannerHref}
              className="inline-flex items-center justify-center rounded-xl bg-white text-ink px-4 py-2.5 text-xs font-extrabold shadow-lg hover:bg-white/95 min-h-[40px] transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {ACTIVITY_OPEN_PLANNER_FR}
            </Link>
            {showSyncCity && onSyncCity ? (
              <button
                type="button"
                onClick={onSyncCity}
                className="inline-flex items-center justify-center rounded-xl bg-white/12 backdrop-blur-md border border-white/25 text-white px-3.5 py-2.5 text-xs font-bold hover:bg-white/20 min-h-[40px] transition-colors"
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
