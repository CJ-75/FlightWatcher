import Link from 'next/link'
import Image from 'next/image'
import {
  cityImageUrl,
  citySlugDisplayNameFr,
  idealLabelFr,
  ITINERARY_DURATION_LABELS,
  ITINERARY_OCCASION_BADGE_LABELS,
  itineraryOccasionEmoji,
  sanitizeUserFacingText,
  type ItineraryDurationKind,
  type ItineraryOccasion,
} from '@waypop/shared'
import type { PublicItinerary } from '@/lib/parcoursApi'
import { SiteFooter } from '@waypop/shared/web'
import { LandingSearch } from '@/components/landing/LandingSearch'
import { LandingStoreCtas } from '@/components/landing/LandingStoreCtas'
import { LivePriceBadge } from '@/components/landing/LivePriceBadge'
import { isPublicImageSrc, PopImage } from '@/components/pop/PopImage'
import { polishPopTitle } from '@/lib/landingHelpers'
import { photoIdentity } from '@/lib/popPhotos'

const CITY_MOOD: Record<string, string> = {
  paris: 'Lumières & cafés',
  barcelone: 'Terrasses & mer',
  rome: 'Pierres & gelato',
  lisbonne: 'Collines & azulejos',
  amsterdam: 'Canaux & vélos',
  berlin: 'Rues & rooftops',
  madrid: 'Tapas & plazas',
  bruxelles: 'Gaufres & art',
  milan: 'Design & espresso',
  vienne: 'Palais & cafés',
  prague: 'Toits & ponts',
  dublin: 'Pubs & quais',
}

/** Remplit la grille si l’API n’a pas encore assez de contenu publié. */
const DEMO_CITY_SLUGS = [
  'paris',
  'barcelone',
  'rome',
  'lisbonne',
  'amsterdam',
  'berlin',
] as const

const DEMO_POP_COUNT: Record<string, number> = {
  paris: 4,
  barcelone: 3,
  rome: 3,
  lisbonne: 2,
  amsterdam: 2,
  berlin: 2,
}

const DEMO_POPS: PublicItinerary[] = [
  {
    id: 'demo-paris-1',
    slug: 'demo',
    title: 'Paris terrasses & musées',
    city_slug: 'paris',
    duration_kind: 'weekend',
    occasions: ['amis'],
    ideal_for: ['amis', 'premiere_fois'],
    budget_estimate_eur: 0,
    is_demo: true,
  },
  {
    id: 'demo-bcn-1',
    slug: 'demo',
    title: 'Barcelone plage & tapas',
    city_slug: 'barcelone',
    duration_kind: 'weekend',
    occasions: ['romantique', 'soleil'],
    ideal_for: ['romantique', 'soleil'],
    budget_estimate_eur: 80,
    is_demo: true,
  },
  {
    id: 'demo-rome-1',
    slug: 'demo',
    title: 'Rome fontaines & gelato',
    city_slug: 'rome',
    duration_kind: 'weekend',
    occasions: ['amis'],
    ideal_for: ['premiere_fois', 'amis'],
    budget_estimate_eur: 60,
    is_demo: true,
  },
  {
    id: 'demo-lis-1',
    slug: 'demo',
    title: 'Lisbonne miradouros',
    city_slug: 'lisbonne',
    duration_kind: 'weekend',
    occasions: ['petit_budget'],
    ideal_for: ['petit_budget', 'premiere_fois'],
    budget_estimate_eur: 40,
    is_demo: true,
  },
  {
    id: 'demo-ams-1',
    slug: 'demo',
    title: 'Amsterdam canaux & vélos',
    city_slug: 'amsterdam',
    duration_kind: 'weekend',
    occasions: ['amis', 'soleil'],
    ideal_for: ['amis'],
    budget_estimate_eur: 70,
    is_demo: true,
  },
  {
    id: 'demo-ber-1',
    slug: 'demo',
    title: 'Berlin rooftops & street food',
    city_slug: 'berlin',
    duration_kind: 'weekend',
    occasions: ['nuit', 'amis'],
    ideal_for: ['nuit', 'amis'],
    budget_estimate_eur: 55,
    is_demo: true,
  },
]

function padCitySlugs(real: string[], min = 6): string[] {
  const out = [...new Set(real.map((s) => s.toLowerCase()).filter(Boolean))]
  for (const s of DEMO_CITY_SLUGS) {
    if (out.length >= min) break
    if (!out.includes(s)) out.push(s)
  }
  return out.slice(0, 6)
}

function padPops(
  real: PublicItinerary[],
  min = 6,
  demos: PublicItinerary[] = DEMO_POPS,
): PublicItinerary[] {
  if (real.length >= min) return real.slice(0, min)
  const out = [...real]
  const seen = new Set(out.map((p) => p.id))
  for (const demo of demos) {
    if (out.length >= min) break
    if (seen.has(demo.id)) continue
    out.push(demo)
    seen.add(demo.id)
  }
  return out
}

type CityCard = {
  slug: string
  label: string
  photo: string
  mood: string
  popCount: number
}

type Props = {
  pops: PublicItinerary[]
  openCities?: string[]
  popCountByCity?: Record<string, number>
}

export function LandingHome({
  pops,
  openCities = [],
  popCountByCity = {},
}: Props) {
  const displayPops = padPops(pops)

  const cityCards: CityCard[] = padCitySlugs(openCities).map((slug) => ({
    slug,
    label: citySlugDisplayNameFr(slug) || slug,
    photo: cityImageUrl(slug),
    mood: CITY_MOOD[slug] || 'Week-ends déjà pensés',
    popCount: popCountByCity[slug] || DEMO_POP_COUNT[slug] || 2,
  }))

  const usedPhotos = new Set<string>()
  const takePhoto = (src: string | null | undefined, fallback: string) => {
    const cand = src && isPublicImageSrc(src) ? src : fallback
    const id = photoIdentity(cand)
    if (id && usedPhotos.has(id)) return fallback
    if (id) usedPhotos.add(id)
    return cand
  }

  const parisHero = cityImageUrl('paris')
  const barcelonaHero = cityImageUrl('barcelone')
  const romeHero = cityImageUrl('rome')

  const dreamScenes = [
    {
      photo: takePhoto(parisHero, parisHero),
      title: 'Vendredi 18h',
      line: 'Le séjour est booké. Le week-end est calé. Toi, tu souris déjà.',
    },
    {
      photo: takePhoto(barcelonaHero, barcelonaHero),
      title: 'Samedi soir',
      line: 'Une terrasse, une ville qui brille, zéro « on fait quoi ? ».',
    },
    {
      photo: takePhoto(romeHero, romeHero),
      title: 'Dimanche midi',
      line: 'Brunch lent, rues calmes — le Pop a tout prévu.',
    },
  ]

  return (
    <div className="min-h-screen overflow-x-hidden bg-canvas text-ink">
      <header className="relative z-30 border-b border-line bg-canvas/95">
        <div className="mx-auto flex max-w-pop items-center justify-between gap-4 px-5 py-4">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <PlaneLogo />
            <span className="text-lg font-extrabold tracking-tight text-ink">
              Waypop
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-ink lg:flex">
            <a href="#how" className="text-ink no-underline hover:text-accent">
              Comment ça marche
            </a>
            <a
              href="#destinations"
              className="text-ink no-underline hover:text-accent"
            >
              Destinations
            </a>
            <a href="#pops" className="text-ink no-underline hover:text-accent">
              Pops
            </a>
            <a
              href="#alertes"
              className="text-ink no-underline hover:text-accent"
            >
              Alertes
            </a>
          </nav>
          <Link href="/sejours" className="wp-cta-ink text-sm py-2.5 px-4">
            Voir les week-ends
          </Link>
        </div>
      </header>

      {/* —— Hero —— */}
      <section className="relative overflow-hidden pb-12 pt-8 lg:pb-16 lg:pt-12">
        <div
          className="tv-wash -right-10 top-0 h-[28rem] w-[28rem] sm:right-[8%]"
          aria-hidden
        />
        <div className="tv-wash -left-16 bottom-0 h-64 w-64" aria-hidden />

        <div className="relative z-10 mx-auto grid max-w-pop items-center gap-12 px-5 lg:grid-cols-2 lg:gap-10">
          <div className="max-w-lg">
            <p className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-ink">
              App iOS & Android
            </p>
            <p className="mt-4 text-lg font-bold text-accent sm:text-xl">
              Ce week-end, tu es ailleurs
            </p>
            <h1 className="mt-2 text-[2.2rem] font-extrabold leading-[1.1] tracking-tight text-ink sm:text-4xl lg:text-[2.85rem]">
              Week-ends pas chers, déjà organisés
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-ink-muted">
              Prix vol + hôtel, Pops jour par jour, Planner partagé. Solo, à
              deux ou à plusieurs — dans une seule app.
            </p>
            <div className="mt-8">
              <LandingSearch />
            </div>
            <div className="mt-5">
              <LandingStoreCtas variant="badges" />
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[20rem] lg:max-w-[22rem]">
            <div
              className="absolute left-1/2 top-1/2 h-[105%] w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft/80"
              aria-hidden
            />
            <div className="wp-float">
              <PhoneMock photo={takePhoto(parisHero, parisHero)} />
            </div>
            <p className="relative z-10 mt-3 text-center text-[11px] font-semibold text-ink-muted">
              Illustration — aperçu de l’app
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-sand/60 py-4">
        <div className="mx-auto flex max-w-pop flex-wrap items-center justify-center gap-x-8 gap-y-2 px-5 text-xs font-bold uppercase tracking-wide text-ink sm:text-sm">
          <span>Vol + hôtel</span>
          <span className="text-accent">·</span>
          <span>Pops jour par jour</span>
          <span className="text-accent">·</span>
          <span>Alertes prix</span>
          <span className="text-accent">·</span>
          <span>Planner partagé</span>
        </div>
      </section>

      <section id="how" className="relative scroll-mt-8 py-16 sm:py-20">
        <div className="relative z-10 mx-auto max-w-pop px-5">
          <div className="mx-auto max-w-xl text-center">
            <p className="text-sm font-bold text-accent">3 étapes</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Choisis. Planifie. Pars.
            </h2>
          </div>
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              {
                n: '1',
                t: 'Trouve un week-end',
                d: 'Séjour vol+hôtel ou destination — filtre dates & budget.',
              },
              {
                n: '2',
                t: 'Ouvre un Pop',
                d: 'Le programme est déjà là. Tu sais quoi faire.',
              },
              {
                n: '3',
                t: 'Ajoute au Planner',
                d: 'Alerte prix + programme. Tu décides, tu pars.',
              },
            ].map((step) => (
              <li
                key={step.n}
                className="rounded-3xl border border-line bg-white p-6 text-center shadow-soft"
              >
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-ink text-sm font-extrabold text-cream">
                  {step.n}
                </span>
                <p className="mt-4 text-lg font-extrabold text-ink">{step.t}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {step.d}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        id="destinations"
        className="relative scroll-mt-8 bg-sand/50 py-16 sm:py-20"
      >
        <div className="relative z-10 mx-auto max-w-pop px-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              <p className="text-sm font-bold text-accent">Évasions</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
                Des villes qui font déjà rêver
              </h2>
              <p className="mt-2 text-sm text-ink-muted">
                Choisis une ville. Les Pops publiés sont déjà là.
              </p>
            </div>
            <Link
              href="/sejours"
              className="text-sm font-bold text-ink no-underline hover:text-accent"
            >
              Voir tous les week-ends →
            </Link>
          </div>

          {cityCards.length > 0 ? (
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cityCards.map((d) => (
                <li key={d.slug}>
                  <Link
                    href={`/pop/${d.slug}`}
                    className="group relative block overflow-hidden rounded-[1.75rem] shadow-lift no-underline"
                  >
                    <div className="relative aspect-[5/4] overflow-hidden">
                      <Image
                        src={takePhoto(d.photo, d.photo)}
                        alt={d.label}
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/25 to-transparent" />
                      <LivePriceBadge
                        destCity={d.slug}
                        className="absolute right-3 top-3"
                      />
                      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                        <p className="text-xs font-bold uppercase tracking-wide text-accent-soft">
                          {d.mood}
                        </p>
                        <p className="mt-1 text-2xl font-extrabold text-cream">
                          {d.label}
                        </p>
                        <p className="mt-1.5 text-sm font-semibold text-cream/85">
                          {d.popCount > 0
                            ? `${d.popCount} Pop${d.popCount > 1 ? 's' : ''} à suivre`
                            : 'Explorer les Pops'}
                          <span className="ml-1 opacity-0 transition-opacity group-hover:opacity-100">
                            →
                          </span>
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-8 text-sm text-ink-muted">
              Les destinations ouvertes arrivent bientôt.
            </p>
          )}
        </div>
      </section>

      {displayPops.length > 0 ? (
        <section id="pops" className="scroll-mt-8 bg-sand/40 py-14 sm:py-20">
          <div className="mx-auto max-w-pop px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-bold text-accent">Pops</p>
                <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
                  Pops prêts à suivre
                </h2>
                <p className="mt-2 max-w-md text-sm text-ink-muted">
                  Programmes jour par jour. Tu ouvres, tu suis, tu profites.
                </p>
              </div>
              <Link
                href={`/pop/${cityCards[0]?.slug || 'paris'}`}
                className="text-sm font-bold text-ink no-underline hover:text-accent"
              >
                Voir plus →
              </Link>
            </div>

            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {displayPops.map((it) => (
                <li key={it.id} className="h-full">
                  <PopCard it={it} takePhoto={takePhoto} dense />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section id="alertes" className="relative py-14 sm:py-20">
        <div className="relative z-10 mx-auto max-w-pop px-5">
          <div className="grid items-center gap-10 overflow-hidden rounded-[2rem] bg-ink lg:grid-cols-2 lg:gap-0">
            <div className="relative aspect-[5/4] lg:aspect-auto lg:min-h-[22rem]">
              <Image
                src={takePhoto(barcelonaHero, barcelonaHero)}
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/20 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-ink/40 lg:to-ink" />
            </div>
            <div className="relative px-6 pb-10 pt-2 sm:px-10 sm:pb-12 lg:py-14 lg:pl-4 lg:pr-12">
              <p className="text-sm font-bold text-[#FF6B35]">Alertes</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-cream sm:text-4xl">
                Le prix baisse, tu le sais
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-cream/75">
                Choisis une destination. On te prévient quand le week-end
                devient intéressant. Tu bookes quand tu veux.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/alertes"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cream px-6 py-3.5 text-sm font-bold text-ink no-underline transition-colors hover:bg-white"
                >
                  Créer une alerte
                  <span aria-hidden>→</span>
                </Link>
                <Link
                  href="/sejours"
                  className="inline-flex items-center justify-center rounded-2xl border border-cream/25 px-5 py-3.5 text-sm font-bold text-cream no-underline transition-colors hover:border-cream/50"
                >
                  Voir les week-ends
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="app"
        className="relative scroll-mt-8 bg-sand/40 py-16 sm:py-20"
      >
        <div className="relative z-10 mx-auto max-w-pop px-5">
          <div className="mx-auto max-w-xl text-center">
            <p className="text-sm font-bold text-accent">Dans l’app</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Tout ce qu’il faut pour partir
            </h2>
          </div>
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: 'Séjours',
                d: 'Vol + hôtel packagés depuis ton aéroport.',
                icon: <GlobeIcon />,
              },
              {
                title: 'Pops',
                d: 'Programme jour par jour, adresses & tips.',
                icon: <BagIcon />,
              },
              {
                title: 'Alertes',
                d: 'On te prévient quand le prix baisse.',
                icon: <BellIcon />,
              },
              {
                title: 'Planner',
                d: 'Invite qui tu veux, votez, validez.',
                icon: <TicketIcon />,
              },
            ].map((s) => (
              <li
                key={s.title}
                className="rounded-3xl bg-white p-6 shadow-soft"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-ink">
                  {s.icon}
                </span>
                <p className="mt-4 text-lg font-extrabold text-ink">{s.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {s.d}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Dream scenes — Waypop cities only */}
      <section id="reve" className="relative py-16 sm:py-20">
        <div className="relative z-10 mx-auto max-w-pop px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold text-accent">Projette-toi</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Vendredi tu rêves. Dimanche tu y étais.
            </h2>
          </div>
          <ul className="mt-12 grid gap-5 lg:grid-cols-3">
            {dreamScenes.map((scene) => (
              <li
                key={scene.title}
                className="group relative overflow-hidden rounded-[1.75rem] shadow-lift"
              >
                <div className="relative aspect-[3/4] sm:aspect-[4/5]">
                  <Image
                    src={scene.photo}
                    alt=""
                    fill
                    sizes="(max-width: 1024px) 100vw, 33vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/25 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-6">
                    <p className="text-xs font-bold uppercase tracking-wide text-accent-soft">
                      {scene.title}
                    </p>
                    <p className="mt-2 text-lg font-extrabold leading-snug text-cream">
                      {scene.line}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Final CTA — 2nd store badges occurrence */}
      <section className="relative py-12 sm:py-16">
        <div className="relative z-10 mx-auto max-w-pop px-5">
          <div className="relative overflow-hidden rounded-[2rem] bg-accent-soft px-6 py-14 text-center sm:px-12">
            <h2 className="relative text-2xl font-extrabold tracking-tight text-ink sm:text-3xl lg:text-4xl">
              Ton prochain week-end t’attend
            </h2>
            <p className="relative mx-auto mt-3 max-w-sm text-sm text-ink-muted">
              Cherche un séjour, ouvre un Pop, pars à ton rythme.
            </p>
            <div className="relative mt-6 flex justify-center">
              <Link href="/sejours" className="wp-cta-ink">
                Voir les week-ends
              </Link>
            </div>
            <div className="relative mt-6 flex justify-center">
              <LandingStoreCtas variant="badges" />
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}

function popCardTags(it: PublicItinerary): { key: string; label: string; emoji?: string }[] {
  const tags: { key: string; label: string; emoji?: string }[] = []
  if (it.duration_kind) {
    const label =
      ITINERARY_DURATION_LABELS[it.duration_kind as ItineraryDurationKind] ||
      String(it.duration_kind)
    tags.push({ key: `dur-${it.duration_kind}`, label })
  }
  const key = (
    (it.ideal_for?.length ? it.ideal_for : it.occasions) || []
  ).find(Boolean) as string | undefined
  if (key) {
    const label =
      idealLabelFr(key) ||
      ITINERARY_OCCASION_BADGE_LABELS[key as ItineraryOccasion] ||
      key
    if (label) {
      tags.push({
        key: `occ-${key}`,
        label,
        emoji: itineraryOccasionEmoji(key),
      })
    }
  }
  return tags
}

function PopCard({
  it,
  takePhoto,
  dense = false,
}: {
  it: PublicItinerary
  takePhoto: (src: string | null | undefined, fallback: string) => string
  dense?: boolean
}) {
  const city = String(it.city_slug || 'paris')
  const cover = takePhoto(it.cover_image, cityImageUrl(city))
  const title = polishPopTitle(sanitizeUserFacingText(it.title) || it.title)
  const tags = popCardTags(it)
  const href = it.is_demo
    ? `/pop/${city}`
    : `/pop/${city}/${encodeURIComponent(it.slug || it.id)}`

  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-soft no-underline hover:shadow-lift"
    >
      <div
        className={`relative shrink-0 overflow-hidden ${
          dense ? 'aspect-[4/3]' : 'aspect-[5/4]'
        }`}
      >
        {isPublicImageSrc(cover) ? (
          <PopImage
            src={cover}
            alt=""
            variant="card"
            fill
            className="transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <Image
            src={cityImageUrl(city)}
            alt=""
            fill
            className="object-cover"
            sizes="33vw"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/55 via-transparent to-transparent" />
        <LivePriceBadge destCity={city} className="absolute right-3 top-3" />
        <p className="absolute bottom-3 left-3 text-xs font-bold uppercase tracking-wide text-cream">
          {citySlugDisplayNameFr(city) || city}
        </p>
      </div>
      <div className="flex flex-1 flex-col px-4 py-4">
        <p className="line-clamp-2 min-h-[2.75rem] font-extrabold leading-snug text-ink">
          {title}
        </p>
        {tags.length > 0 ? (
          <div className="mt-2 flex min-h-[1.75rem] flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t.key}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-sand/70 px-2.5 py-1 text-[11px] font-bold text-ink"
              >
                {t.emoji ? <span aria-hidden>{t.emoji}</span> : null}
                {t.label}
              </span>
            ))}
          </div>
        ) : (
          <div className="mt-2 min-h-[1.75rem]" aria-hidden />
        )}
      </div>
    </Link>
  )
}

function PhoneMock({ photo }: { photo: string }) {
  return (
    <div className="relative z-10 mx-auto w-[15.5rem] sm:w-[17rem]">
      <div className="rounded-[2.4rem] border-[6px] border-ink bg-ink p-2 shadow-lift">
        <div className="overflow-hidden rounded-[1.9rem] bg-canvas">
          <div className="flex items-center justify-between px-5 pb-2 pt-3">
            <span className="text-[10px] font-bold text-ink">9:41</span>
            <span className="h-4 w-20 rounded-full bg-ink/90" />
            <span className="text-[10px] font-bold text-ink">100%</span>
          </div>
          <div className="px-4 pb-5">
            <p className="text-xs font-bold text-accent">Waypop</p>
            <p className="mt-1 text-lg font-extrabold leading-tight text-ink">
              Week-end à Paris
            </p>
            <div className="relative mt-3 aspect-[5/3] overflow-hidden rounded-2xl">
              <Image
                src={photo}
                alt=""
                fill
                sizes="240px"
                className="object-cover"
                priority
              />
            </div>
            <div className="mt-3 space-y-2">
              {[
                { t: 'Vol Lyon → Paris', p: '89€' },
                { t: 'Hôtel · 2 nuits', p: '200€' },
                { t: 'Pop · 2 jours', p: 'Prêt' },
              ].map((row) => (
                <div
                  key={row.t}
                  className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5 shadow-soft"
                >
                  <span className="text-xs font-semibold text-ink">{row.t}</span>
                  <span className="text-xs font-extrabold text-accent">
                    {row.p}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl bg-ink py-2.5 text-center text-xs font-bold text-cream">
              Ouvrir le Planner
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlaneLogo() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-cream shadow-lift">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M10 14L3 11l18-7-7 18-3-7-4-1z" fill="currentColor" />
      </svg>
    </span>
  )
}

function GlobeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3 12h18M12 3c2.5 2.8 3.8 5.8 3.8 9S14.5 18.2 12 21c-2.5-2.8-3.8-5.8-3.8-9S9.5 5.8 12 3z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function BagIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 8h12l1 12H5L6 8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9 8V6a3 3 0 0 1 6 0v2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function TicketIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M9 8v8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeDasharray="2 2"
      />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M10 18a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
