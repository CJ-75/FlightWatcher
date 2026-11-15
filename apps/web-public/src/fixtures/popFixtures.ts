import type { PublicItinerary } from '@/lib/parcoursApi'

const PHOTO =
  'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1600&q=80'
const PHOTO2 =
  'https://images.unsplash.com/photo-1522093007474-d86e9bf7ba6f?auto=format&fit=crop&w=800&q=80'
const PHOTO3 =
  'https://images.unsplash.com/photo-1499853387-4b3839150cba?auto=format&fit=crop&w=800&q=80'

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
    target_query: 'Paris en 2 jours première visite',
    subtitle: 'Fixture riche (Lot 5)',
    intro:
      'Deux jours pour découvrir Paris sans courir : rive droite le premier jour, rive gauche le second, avec des pauses café et des points de vue. Ce texte dépasse volontairement 80 caractères pour le seuil SEO.',
    cover_image: PHOTO,
    photo_license: 'Unsplash',
    photo_source: 'unsplash',
    photo_author: 'Fixture',
    city_slug: 'paris',
    status: 'published',
    is_demo: true,
    duration_kind: 'weekend',
    occasions: ['romantique'],
    ideal_for: ['romantique', 'premiere_fois'],
    pace: 'moderate',
    transport_modes: ['métro', 'marche'],
    budget_estimate_eur: 80,
    verified_at: '2026-10-01T10:00:00Z',
    color_key: 'paris',
    stay: {
      area: 'Le Marais',
      vibe: 'Central et walkable',
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
        photo: PHOTO2,
        day_offset: 0,
        moment: 'morning',
        kind: 'place',
        meta: { lat: 48.8646, lng: 2.347 },
      }),
      stop({
        id: 'r2',
        title: 'Centre Pompidou (extérieur)',
        note: 'Vue sur le plaza, photo de la structure, sans file si tu restes dehors.',
        photo: PHOTO3,
        day_offset: 0,
        moment: 'afternoon',
        kind: 'place',
        meta: { lat: 48.8606, lng: 2.3522, travel_minutes: 12 },
      }),
      stop({
        id: 'r3',
        title: 'Coucher de soleil Pont Neuf',
        note: 'Arrive 30 min avant pour une place sur le pont.',
        photo: PHOTO,
        day_offset: 0,
        moment: 'evening',
        kind: 'place',
        meta: { lat: 48.857, lng: 2.341, travel_minutes: 15 },
      }),
      stop({
        id: 'r4',
        title: 'Rive gauche — café près d’Odéon',
        note: 'Matinée calme, lit un peu, marche vers le jardin.',
        photo: PHOTO2,
        day_offset: 1,
        moment: 'morning',
        kind: 'place',
        meta: { lat: 48.8493, lng: 2.3387 },
      }),
      stop({
        id: 'r5',
        title: 'Jardin du Luxembourg',
        note: 'Tour des allées sud, pause banc si le soleil est là.',
        photo: PHOTO3,
        day_offset: 1,
        moment: 'afternoon',
        kind: 'place',
        meta: { lat: 48.8462, lng: 2.3371, travel_minutes: 8 },
      }),
      stop({
        id: 'r6',
        title: 'Dîner rue Mouffetard',
        note: 'Quartier animé, réserve si week-end chargé.',
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
    cover_image: PHOTO2,
    photo_license: 'Unsplash',
    city_slug: 'paris',
    status: 'published',
    is_demo: true,
    duration_kind: 'day',
    occasions: ['amis'],
    pace: 'packed',
    verified_at: '2026-09-15T10:00:00Z',
    tips: ['Prends un goûter pour le milieu d’après-midi.'],
    itinerary_items: [
      stop({
        id: 'm1',
        title: 'Notre-Dame (parvis)',
        note: 'Point de départ clair, photos du parvis.',
        photo: PHOTO,
        day_offset: 0,
        moment: 'morning',
        kind: 'place',
      }),
      stop({
        id: 'm2',
        title: 'Sainte-Chapelle (extérieur)',
        note: 'Si la file est longue, continue et reviens plus tard.',
        day_offset: 0,
        moment: 'morning',
        kind: 'place',
        meta: { travel_minutes: 5 },
      }),
      stop({
        id: 'm3',
        title: 'Pont des Arts',
        note: 'Traverse vers le Louvre sans entrer obligatoirement.',
        photo: PHOTO3,
        day_offset: 0,
        moment: 'afternoon',
        kind: 'place',
        meta: { travel_minutes: 10 },
      }),
      stop({
        id: 'm4',
        title: 'Jardin des Tuileries',
        note: 'Fin de journée au calme, direction Concorde ou métro.',
        photo: PHOTO2,
        day_offset: 0,
        moment: 'evening',
        kind: 'place',
        meta: { travel_minutes: 8 },
      }),
    ],
  },

  'fixture-seuil': {
    id: 'fix-seuil',
    slug: 'fixture-seuil',
    title: 'Paris au seuil SEO',
    intro:
      'Intro volontairement juste au-dessus de 80 caractères pour tester le seuil d’indexation sans valeur ajoutée complète.',
    cover_image: PHOTO3,
    photo_license: 'Unsplash',
    city_slug: 'paris',
    status: 'published',
    is_demo: true,
    duration_kind: 'day',
    occasions: ['petit_budget'],
    // pas de verified_at / tips / travel → noindex attendu
    itinerary_items: [
      stop({
        id: 's1',
        title: 'Stop A',
        note: 'Note A pour ratio notes.',
        photo: PHOTO,
        day_offset: 0,
        moment: 'morning',
        kind: 'place',
      }),
      stop({
        id: 's2',
        title: 'Stop B',
        note: 'Note B.',
        photo: PHOTO2,
        day_offset: 0,
        moment: 'afternoon',
        kind: 'place',
      }),
      stop({
        id: 's3',
        title: 'Stop C',
        day_offset: 0,
        moment: 'afternoon',
        kind: 'place',
      }),
      stop({
        id: 's4',
        title: 'Stop D',
        note: 'Note D.',
        day_offset: 0,
        moment: 'evening',
        kind: 'place',
      }),
    ],
  },

  'fixture-pauvre': {
    id: 'fix-pauvre',
    slug: 'fixture-pauvre',
    title: 'P',
    intro: null,
    cover_image: null,
    city_slug: 'paris',
    status: 'published',
    is_demo: true,
    duration_kind: '2h',
    occasions: [],
    color_key: 'paris',
    itinerary_items: [
      stop({
        id: 'p1',
        title: 'Seul stop',
        day_offset: 0,
        moment: 'morning',
        kind: 'free',
      }),
    ],
  },

  'fixture-long-title': {
    id: 'fix-long',
    slug: 'fixture-long-title',
    title:
      'Un titre extrêmement long de quatre-vingt-dix caractères pile pour stresser le hero et le SEO title',
    target_query:
      'Un titre extrêmement long de quatre-vingt-dix caractères pile pour stresser',
    intro:
      'Fixture titre long + quinze stops sur quatre jours pour vérifier le programme, les onglets et l’absence de scroll horizontal.',
    cover_image: PHOTO,
    photo_license: 'Unsplash',
    city_slug: 'paris',
    status: 'published',
    is_demo: true,
    duration_kind: 'weekend',
    occasions: ['famille'],
    verified_at: '2026-08-01T10:00:00Z',
    itinerary_items: Array.from({ length: 15 }, (_, i) =>
      stop({
        id: `l${i}`,
        title: `Arrêt numéro ${i + 1} avec un nom un peu long pour la carte`,
        note:
          i % 2 === 0
            ? `Note pour le stop ${i + 1}, assez longue pour le ratio.`
            : null,
        photo: i % 3 === 0 ? PHOTO2 : i % 3 === 1 ? PHOTO3 : null,
        day_offset: Math.floor(i / 4),
        moment: (['morning', 'afternoon', 'evening'] as const)[i % 3],
        kind: 'place',
        meta: i > 0 ? { travel_minutes: 5 + (i % 10) } : {},
      }),
    ),
  },
}

export const FIXTURE_SLUGS = Object.keys(POP_FIXTURES)

export function getFixture(slug: string): PublicItinerary | null {
  return POP_FIXTURES[slug] || null
}
