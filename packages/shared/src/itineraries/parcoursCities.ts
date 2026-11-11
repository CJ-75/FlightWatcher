/**
 * Villes catalogue Parcours (top France) — indépendantes du catalogue aéroports.
 * Ne pas réutiliser pour Activités / Vols / Séjours : certaines n’ont pas de hub.
 */

function slugifyCityLabel(label: string): string {
  return String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Top ~30 villes FR pour créer un parcours (pop. / tourisme).
 * Ordre = priorité d’affichage dans le picker Parcours.
 */
export const PARCOURS_TOP_FR_CITY_LABELS = [
  'Paris',
  'Marseille',
  'Lyon',
  'Toulouse',
  'Nice',
  'Nantes',
  'Montpellier',
  'Strasbourg',
  'Bordeaux',
  'Lille',
  'Rennes',
  'Reims',
  'Toulon',
  'Grenoble',
  'Dijon',
  'Angers',
  'Nîmes',
  'Saint-Étienne',
  'Le Havre',
  'Clermont-Ferrand',
  'Aix-en-Provence',
  'Brest',
  'Tours',
  'Amiens',
  'Limoges',
  'Annecy',
  'Perpignan',
  'Orléans',
  'Rouen',
  'Avignon',
] as const

export type ParcoursCityOption = {
  slug: string
  label: string
  country: 'France'
  iso: 'FR'
  /**
   * false = ville catalogue Parcours sans hub aérien connu.
   * Les flux Vols / MakeTrip ne doivent pas inventer un IATA.
   */
  flightHub: boolean
}

/** Hubs FR déjà mappés ailleurs (vols / MakeTrip). */
const PARCOURS_FR_FLIGHT_HUBS: Record<string, string> = {
  paris: 'CDG,ORY',
  marseille: 'MRS',
  lyon: 'LYS',
  nice: 'NCE',
  bordeaux: 'BOD',
  toulouse: 'TLS',
  nantes: 'NTE',
  montpellier: 'MPL',
  strasbourg: 'SXB',
  lille: 'LIL',
  rennes: 'RNS',
  toulon: 'TLN',
  grenoble: 'GNB',
  'clermont-ferrand': 'CFE',
  brest: 'BES',
  tours: 'TUF',
  limoges: 'LIG',
  perpignan: 'PGF',
  'biarritz': 'BIQ',
  'ajaccio': 'AJA',
  'bastia': 'BIA',
  'figari': 'FSC',
  'calvi': 'CLY',
}

function buildParcoursFrOptions(): ParcoursCityOption[] {
  const seen = new Set<string>()
  const out: ParcoursCityOption[] = []
  for (const label of PARCOURS_TOP_FR_CITY_LABELS) {
    const slug = slugifyCityLabel(label)
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    out.push({
      slug,
      label,
      country: 'France',
      iso: 'FR',
      flightHub: Boolean(PARCOURS_FR_FLIGHT_HUBS[slug]),
    })
  }
  return out
}

export const PARCOURS_CITY_OPTIONS_FR: readonly ParcoursCityOption[] =
  buildParcoursFrOptions()

const BY_SLUG = new Map(
  PARCOURS_CITY_OPTIONS_FR.map((c) => [c.slug, c] as const),
)

/** True si le slug est dans le référentiel Parcours FR (même sans aéroport). */
export function isParcoursFrCitySlug(slug?: string | null): boolean {
  const key = String(slug || '')
    .trim()
    .toLowerCase()
  return Boolean(key && BY_SLUG.has(key))
}

/** Libellé FR catalogue Parcours, ou null si hors référentiel. */
export function parcoursCityLabelFr(slug?: string | null): string | null {
  const key = String(slug || '')
    .trim()
    .toLowerCase()
  return BY_SLUG.get(key)?.label || null
}

export function parcoursCityOption(
  slug?: string | null,
): ParcoursCityOption | null {
  const key = String(slug || '')
    .trim()
    .toLowerCase()
  return BY_SLUG.get(key) || null
}

/**
 * IATA d’arrivée pour un city_slug parcours.
 * null = ville sans hub (ne pas inventer de code pour Vols / Planner).
 */
export function arrivalCodesForParcoursCitySlug(
  slug?: string | null,
): string | null {
  const key = String(slug || '')
    .trim()
    .toLowerCase()
  if (!key) return null
  if (PARCOURS_FR_FLIGHT_HUBS[key]) return PARCOURS_FR_FLIGHT_HUBS[key]
  const opt = BY_SLUG.get(key)
  if (opt && !opt.flightHub) return null
  return null
}

/** Ville Parcours sans hub — safe pour UI / warnings hors catalogue aéroports. */
export function isParcoursCityWithoutFlightHub(
  slug?: string | null,
): boolean {
  const opt = parcoursCityOption(slug)
  return Boolean(opt && !opt.flightHub)
}
