import type { PublicItinerary } from '@/lib/parcoursApi'

/**
 * Place-bound Unsplash photos (place_id + source + license on each stop).
 * One unique identity per page — never a random city stock shot.
 */
const COVER =
  'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1600&q=80'
const MONTORGUEIL =
  'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80'
/** Centre Pompidou, Paris */
const POMPIDOU =
  'https://images.unsplash.com/photo-1568515387631-8b650bbabba8?auto=format&fit=crop&w=800&q=80'
/** Pont Neuf / Seine, Paris */
const PONT_NEUF =
  'https://images.unsplash.com/photo-1509439581779-6298f75bf6e5?auto=format&fit=crop&w=800&q=80'
const ODEON =
  'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=800&q=80'
const LUXEMBOURG =
  'https://images.unsplash.com/photo-1549144511-f099e773c147?auto=format&fit=crop&w=800&q=80'
const MOUFFETARD =
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=800&q=80'
const NOTRE_DAME =
  'https://images.unsplash.com/photo-1431274172761-fca41d930114?auto=format&fit=crop&w=800&q=80'
const SAINTE_CHAPELLE =
  'https://images.unsplash.com/photo-1522093007474-d86e9bf7ba6f?auto=format&fit=crop&w=800&q=80'
/** Pont des Arts / Seine */
const PONT_ARTS =
  'https://images.unsplash.com/photo-1473951574080-01fe45ec8643?auto=format&fit=crop&w=800&q=80'
const TUILERIES =
  'https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=800&q=80'

function stop(
  partial: NonNullable<PublicItinerary['itinerary_items']>[number],
): NonNullable<PublicItinerary['itinerary_items']>[number] {
  return partial
}

/** Local / preview only — never published, never in sitemap. */
export const POP_FIXTURES: Record<string, PublicItinerary> = {
  'fixture-riche': {
    id: 'fix-riche',
    slug: 'fixture-riche',
    title: 'Paris en 2 jours : itinéraire pour une première visite',
    target_query: 'Paris en 2 jours : itinéraire pour une première visite',
    subtitle:
      'Sans courir — cafés, points de vue et soirées calmes, déjà ordonnés.',
    intro:
      'Deux jours pour découvrir Paris sans courir : rive droite le premier jour, rive gauche le second, avec des pauses café et des points de vue. Programme pensé pour une première visite, avec le bon rythme.',
    cover_image: COVER,
    photo_license: 'Unsplash',
    photo_source: 'unsplash',
    photo_author: 'Fixture',
    city_slug: 'paris',
    status: 'published',
    is_demo: true,
    duration_kind: 'weekend',
    occasions: [],
    ideal_for: ['premiere_fois'],
    pace: 'moderate',
    transport_modes: ['métro', 'marche'],
    budget_estimate_eur: 80,
    verified_at: '2026-10-01T10:00:00Z',
    color_key: 'paris',
    stay: {
      area: 'Le Marais',
      vibe: 'Central, tout à pied',
      note: 'Vise un hôtel près d’une station de métro ligne 1.',
    },
    tips: [
      'Réserve les billets musée la veille.',
      'Le dimanche matin, préfère les quais à l’ouest.',
    ],
    faq: [
      {
        q: 'Faut-il un Navigo ?',
        a: 'Pour un week-end, un carnet de tickets ou le pass journalier suffit souvent.',
      },
      {
        q: 'Combien de marche par jour ?',
        a: 'Compte 8 à 12 km si tu suis tout le programme à pied.',
      },
    ],
    itinerary_items: [
      stop({
        id: 'r1',
        title: 'Café et départ rue Montorgueil',
        note: 'Petit-déjeuner sur place, puis direction les Halles à pied.',
        photo: MONTORGUEIL,
        photo_source: 'unsplash',
        photo_license: 'Unsplash',
        place_id: 'place:montorgueil',
        day_offset: 0,
        moment: 'morning',
        kind: 'place',
        meta: { lat: 48.8646, lng: 2.347 },
      }),
      stop({
        id: 'r2',
        title: 'Centre Pompidou (extérieur)',
        note: 'Vue sur le plaza, photo de la structure, sans file si tu restes dehors.',
        photo: POMPIDOU,
        photo_source: 'unsplash',
        photo_license: 'Unsplash',
        photo_author: 'Unsplash',
        place_id: 'place:pompidou',
        day_offset: 0,
        moment: 'afternoon',
        kind: 'place',
        meta: { lat: 48.8606, lng: 2.3522, travel_minutes: 12 },
      }),
      stop({
        id: 'r3',
        title: 'Coucher de soleil Pont Neuf',
        note: 'Arrive 30 min avant pour une place sur le pont.',
        photo: PONT_NEUF,
        photo_source: 'unsplash',
        photo_license: 'Unsplash',
        photo_author: 'Unsplash',
        place_id: 'place:pont-neuf',
        day_offset: 0,
        moment: 'evening',
        kind: 'place',
        meta: { lat: 48.857, lng: 2.341, travel_minutes: 15 },
      }),
      stop({
        id: 'r4',
        title: 'Rive gauche — café près d’Odéon',
        note: 'Matinée calme, lit un peu, marche vers le jardin.',
        photo: ODEON,
        photo_source: 'unsplash',
        photo_license: 'Unsplash',
        place_id: 'place:odeon',
        day_offset: 1,
        moment: 'morning',
        kind: 'place',
        meta: { lat: 48.8493, lng: 2.3387 },
      }),
      stop({
        id: 'r5',
        title: 'Jardin du Luxembourg',
        note: 'Tour des allées sud, pause banc si le soleil est là.',
        photo: LUXEMBOURG,
        photo_source: 'unsplash',
        photo_license: 'Unsplash',
        place_id: 'place:luxembourg',
        day_offset: 1,
        moment: 'afternoon',
        kind: 'place',
        meta: { lat: 48.8462, lng: 2.3371, travel_minutes: 8 },
      }),
      stop({
        id: 'r6',
        title: 'Dîner rue Mouffetard',
        note: 'Quartier animé, réserve si week-end chargé.',
        photo: MOUFFETARD,
        photo_source: 'unsplash',
        photo_license: 'Unsplash',
        place_id: 'place:mouffetard',
        day_offset: 1,
        moment: 'evening',
        kind: 'place',
        meta: { lat: 48.8422, lng: 2.3499, travel_minutes: 18 },
      }),
    ],
  },

  'fixture-moyen': {
    id: 'fix-moyen',
    slug: 'fixture-moyen',
    title: 'Paris en une journée',
    target_query: 'Paris une journée itinéraire',
    intro:
      'Une journée condensée entre île de la Cité et rive droite, avec quatre arrêts et des notes utiles pour ne pas perdre de temps.',
    cover_image: NOTRE_DAME,
    photo_license: 'Unsplash',
    photo_source: 'unsplash',
    city_slug: 'paris',
    status: 'published',
    is_demo: true,
    duration_kind: 'day',
    occasions: ['amis'],
    ideal_for: ['amis'],
    pace: 'packed',
    verified_at: '2026-09-15T10:00:00Z',
    color_key: 'paris',
    tips: ['Prends un goûter pour le milieu d’après-midi.'],
    itinerary_items: [
      stop({
        id: 'm1',
        title: 'Notre-Dame (parvis)',
        note: 'Point de départ clair, photos du parvis.',
        photo: COVER,
        place_id: 'place:notre-dame',
        photo_source: 'unsplash',
        photo_license: 'Unsplash',
        day_offset: 0,
        moment: 'morning',
        kind: 'place',
        meta: { lat: 48.853, lng: 2.3499 },
      }),
      stop({
        id: 'm2',
        title: 'Sainte-Chapelle (extérieur)',
        note: 'Si la file est longue, continue et reviens plus tard.',
        photo: SAINTE_CHAPELLE,
        place_id: 'place:sainte-chapelle',
        photo_source: 'unsplash',
        photo_license: 'Unsplash',
        day_offset: 0,
        moment: 'morning',
        kind: 'place',
        meta: { travel_minutes: 5, lat: 48.8554, lng: 2.345 },
      }),
      stop({
        id: 'm3',
        title: 'Pont des Arts',
        note: 'Traverse vers le Louvre sans entrer obligatoirement.',
        photo: PONT_ARTS,
        place_id: 'place:pont-des-arts',
        photo_source: 'unsplash',
        photo_license: 'Unsplash',
        day_offset: 0,
        moment: 'afternoon',
        kind: 'place',
        meta: { travel_minutes: 10, lat: 48.8583, lng: 2.3375 },
      }),
      stop({
        id: 'm4',
        title: 'Jardin des Tuileries',
        note: 'Fin de journée au calme, direction Concorde ou métro.',
        photo: TUILERIES,
        place_id: 'place:tuileries',
        photo_source: 'unsplash',
        photo_license: 'Unsplash',
        day_offset: 0,
        moment: 'evening',
        kind: 'place',
        meta: { travel_minutes: 8, lat: 48.8635, lng: 2.3275 },
      }),
    ],
  },

  'fixture-seuil': {
    id: 'fix-seuil',
    slug: 'fixture-seuil',
    title: 'Paris journée budget',
    intro:
      'Intro juste au-dessus de 80 caractères pour tester l’indexation sans valeur ajoutée complète.',
    cover_image: null,
    photo_license: null,
    photo_source: null,
    city_slug: 'paris',
    status: 'published',
    is_demo: true,
    duration_kind: 'day',
    occasions: ['petit_budget'],
    ideal_for: ['petit_budget'],
    color_key: 'paris',
    itinerary_items: [
      stop({
        id: 's1',
        title: 'Stop A',
        note: 'Note A pour ratio notes.',
        photo: null,
        place_id: 'place:seuil-a',
        day_offset: 0,
        moment: 'morning',
        kind: 'place',
      }),
      stop({
        id: 's2',
        title: 'Stop B',
        note: 'Note B pour ratio notes.',
        photo: null,
        place_id: 'place:seuil-b',
        day_offset: 0,
        moment: 'afternoon',
        kind: 'place',
        meta: { travel_minutes: 10 },
      }),
    ],
  },

  'fixture-pauvre': {
    id: 'fix-pauvre',
    slug: 'fixture-pauvre',
    title: 'Paris bref',
    intro: 'Court.',
    cover_image: null,
    photo_license: null,
    photo_source: null,
    city_slug: 'paris',
    status: 'published',
    is_demo: true,
    color_key: 'paris',
    itinerary_items: [
      stop({
        id: 'p1',
        title: 'Un stop',
        day_offset: 0,
        moment: 'morning',
        kind: 'place',
      }),
    ],
  },

  'fixture-long-title': {
    id: 'fix-long-title',
    slug: 'fixture-long-title',
    title:
      'Paris en week-end complet avec musées, quais et restos pour une première visite sans stress',
    target_query:
      'Paris week-end première visite musées quais',
    intro:
      'Un programme dense mais lisible pour tester le titre long côté SEO et UI, avec assez de texte pour passer les seuils de contenu.',
    cover_image: LUXEMBOURG,
    photo_license: 'Unsplash',
    photo_source: 'unsplash',
    city_slug: 'paris',
    status: 'published',
    is_demo: true,
    duration_kind: 'weekend',
    ideal_for: ['premiere_fois'],
    verified_at: '2026-08-01T10:00:00Z',
    color_key: 'paris',
    tips: ['Prends des chaussures confortables.', 'Réserve le soir.'],
    itinerary_items: [
      stop({
        id: 'l1',
        title: 'Départ Marais',
        note: 'Café puis marche.',
        photo: MONTORGUEIL,
        place_id: 'place:long-marais',
        day_offset: 0,
        moment: 'morning',
        kind: 'place',
      }),
      stop({
        id: 'l2',
        title: 'Musée',
        note: 'Visite courte.',
        photo: POMPIDOU,
        place_id: 'place:long-musee',
        day_offset: 0,
        moment: 'afternoon',
        kind: 'place',
        meta: { travel_minutes: 14 },
      }),
      stop({
        id: 'l3',
        title: 'Quais',
        note: 'Fin de journée.',
        photo: PONT_NEUF,
        place_id: 'place:long-quais',
        day_offset: 0,
        moment: 'evening',
        kind: 'place',
        meta: { travel_minutes: 11 },
      }),
    ],
  },
}

export const FIXTURE_SLUGS = Object.keys(POP_FIXTURES)

export function getFixture(slug: string): PublicItinerary | null {
  return POP_FIXTURES[slug] || null
}
