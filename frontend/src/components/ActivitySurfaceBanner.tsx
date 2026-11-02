/**
 * Surfaces hors onglet Activités (Lot F) — deal / transfert / occasions.
 */
import { Link } from 'react-router-dom'
import { ACTIVITIES_PATH, activitiesCityPath, detectEventPlatform } from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'

export function ActivitySurfaceBanner(props: {
  citySlug?: string | null
  surface: 'deal' | 'transfer' | 'occasions' | 'my_trip'
  title?: string
  subtitle?: string
}) {
  const href = props.citySlug
    ? activitiesCityPath(props.citySlug)
    : ACTIVITIES_PATH

  const onClick = () => {
    void getApiClient()
      .trackActivityEvent({
        domain: 'activity',
        event: 'surface_cta',
        surface: props.surface,
        platform: detectEventPlatform('web'),
        meta: { city_slug: props.citySlug },
      })
      .catch(() => undefined)
  }

  return (
    <div className="rounded-2xl border border-primary-100 bg-primary-50/70 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
      <div>
        <p className="font-bold text-primary-950 text-sm">
          {props.title || 'Activités sur place'}
        </p>
        <p className="text-xs text-primary-900/80 mt-0.5">
          {props.subtitle ||
            'Visites, billets et expériences pour ton séjour.'}
        </p>
      </div>
      <Link
        to={href}
        onClick={onClick}
        className="shrink-0 rounded-xl bg-primary-600 text-white text-sm font-bold px-4 py-2 text-center"
      >
        Voir les activités
      </Link>
    </div>
  )
}
