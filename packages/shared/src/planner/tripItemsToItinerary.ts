import type { ItineraryItem, ItineraryItemKind } from '../itineraries/types'

/** Loose trip_items / ActivityStepPanel row used by Planner Programme. */
export type PlannerTripItemLike = {
  id?: string | null
  item_type?: string | null
  title?: string | null
  name?: string | null
  day_offset?: number | null
  moment?: string | null
  notes?: string | null
  /** Soft-removed planner activities — excluded from Programme / Launch Pop. */
  status?: string | null
  meta?: Record<string, unknown> | null
  places?: {
    id?: string
    name?: string
    city_slug?: string | null
    meta?: Record<string, unknown> | null
  } | null
}

function asKind(raw: unknown): ItineraryItemKind {
  const k = String(raw || '').toLowerCase()
  if (k === 'place' || k === 'activity' || k === 'free') return k
  if (k === 'restaurant') return 'place'
  return 'activity'
}

function firstPhoto(meta: Record<string, unknown>): string | null {
  const photoUrl = String(meta.photo_url || '').trim()
  if (photoUrl) return photoUrl
  const photo = String(meta.photo || '').trim()
  if (photo) return photo
  const photos = meta.photos
  if (Array.isArray(photos)) {
    for (const entry of photos) {
      const url = String(entry || '').trim()
      if (url) return url
    }
  }
  return null
}

function photosList(meta: Record<string, unknown>, primary: string | null): string[] {
  const out: string[] = []
  const photos = meta.photos
  if (Array.isArray(photos)) {
    for (const entry of photos) {
      const url = String(entry || '').trim()
      if (url && !out.includes(url)) out.push(url)
    }
  }
  if (primary && !out.includes(primary)) out.unshift(primary)
  return out
}

/**
 * Map planner trip_items (from Pop apply) → ItineraryItem for Pop/Parcours timelines.
 */
export function tripItemToItineraryItem(
  row: PlannerTripItemLike,
  opts?: { itineraryId?: string | null; position?: number },
): ItineraryItem {
  const meta = (row.meta || {}) as Record<string, unknown>
  const notes = String(row.notes || '').trim()
  const titleFromMeta = String(meta.title || '').trim()
  let title =
    String(row.title || '').trim() ||
    String(row.name || '').trim() ||
    titleFromMeta ||
    null
  let note: string | null = null
  if (notes) {
    if (title && notes.startsWith(`${title} — `)) {
      note = notes.slice(title.length + 3).trim() || null
    } else if (title && notes === title) {
      note = null
    } else if (!title) {
      const parts = notes.split(' — ')
      title = parts[0]?.trim() || notes
      note = parts.slice(1).join(' — ').trim() || null
    } else {
      note = notes
    }
  }

  const photo = firstPhoto(meta)
  const photos = photosList(meta, photo)
  const kind = asKind(meta.itinerary_kind || row.item_type)
  const product =
    String(meta.viator_product_code || meta.product_code || '').trim() || null

  const nextMeta: ItineraryItem['meta'] = {
    ...meta,
    ...(photos.length ? { photos } : {}),
  }
  if (meta.maps_url != null) nextMeta.maps_url = String(meta.maps_url)
  if (meta.lat != null && Number.isFinite(Number(meta.lat))) {
    nextMeta.lat = Number(meta.lat)
  }
  if (meta.lng != null && Number.isFinite(Number(meta.lng))) {
    nextMeta.lng = Number(meta.lng)
  }

  return {
    id: String(row.id || `item-${opts?.position ?? 0}`),
    itinerary_id: String(opts?.itineraryId || meta.from_itinerary_item_id || ''),
    kind,
    position: opts?.position ?? 0,
    title,
    note,
    photo,
    place_id: row.places?.id || null,
    viator_product_code: product,
    day_offset: row.day_offset == null ? 0 : Number(row.day_offset),
    moment: row.moment ?? null,
    meta: nextMeta,
    places: row.places
      ? {
          id: row.places.id,
          name: row.places.name,
          city_slug: row.places.city_slug,
          meta: row.places.meta || null,
        }
      : null,
  }
}

export function tripItemsToItineraryItems(
  rows: PlannerTripItemLike[],
  opts?: { itineraryId?: string | null },
): ItineraryItem[] {
  return rows
    .filter((r) => {
      if (String(r.status || '') === 'skipped') return false
      const t = String(r.item_type || 'activity')
      return t === 'activity' || t === 'restaurant' || t === 'place'
    })
    .map((r, i) => tripItemToItineraryItem(r, { ...opts, position: i }))
}
