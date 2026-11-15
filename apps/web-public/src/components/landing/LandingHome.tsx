import Link from 'next/link'
import Image from 'next/image'
import {
  cityImageUrl,
  citySlugDisplayNameFr,
  sanitizeUserFacingText,
} from '@waypop/shared'
import type { PublicItinerary } from '@/lib/parcoursApi'
import { LandingSearch } from '@/components/landing/LandingSearch'
import { LandingStoreCtas } from '@/components/landing/LandingStoreCtas'
import { LivePriceBadge } from '@/components/landing/LivePriceBadge'
import { isPublicImageSrc, PopImage } from '@/components/pop/PopImage'
import { polishPopTitle } from '@/lib/landingHelpers'
import { photoIdentity } from '@/lib/popPhotos'

type CityCard = {
  slug: string
  label: string
  photo: string
  mood?: string
}

type Props = {
  pops: PublicItinerary[]
  openCities?: string[]
  momentDeals?: PublicItinerary[]
}

export function LandingHome({
  pops,
  openCities = [],
  momentDeals = [],
}: Props) {
  const cityCards: CityCard[] = openCities.slice(0, 6).map((slug) => ({
    slug,
    label: citySlugDisplayNameFr(slug) || slug,
    photo: cityImageUrl(slug),
    mood: 'Pops publiés',
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
      line: 'Le séjour est booké. Le groupe est chaud. Toi, tu souris déjà.',
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
            <a href="#app" className="text-ink no-underline hover:text-accent">
              L’app
            </a>
            <a href="#how" className="text-ink no-underline hover:text-accent">
              Comment ça marche
            </a>
            <Link
              href="/pop/paris"
              className="text-ink no-underline hover:text-accent"
            >
              Pops
            </Link>
            <a
              href="#destinations"
              className="text-ink no-underline hover:text-accent"
            >
              Destinations
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
              Week-ends pas chers entre amis, déjà organisés
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-ink-muted">
              Prix vol + hôtel, Pops jour par jour, Planner de groupe — dans une
              seule app.
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
          <span>Planner de groupe</span>
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
                d: 'Invite, votez, validez — entre potes.',
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

      <section id="how" className="relative scroll-mt-8 py-16 sm:py-20">
        <div className="relative z-10 mx-auto max-w-pop px-5">
          <div className="mx-auto max-w-xl text-center">
            <p className="text-sm font-bold text-accent">3 étapes</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Choisis. Invite. Pars.
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
                t: 'Lance le groupe',
                d: 'Planner + alerte prix. Vous décidez, vous partez.',
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

      {/* Cities with published pops */}
      <section
        id="destinations"
        className="relative scroll-mt-8 bg-sand/50 py-16 sm:py-20"
      >
        <div className="relative z-10 mx-auto max-w-pop px-5">
          <div className="max-w-xl">
            <p className="text-sm font-bold text-accent">Évasions</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Des villes qui font déjà rêver
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Uniquement des villes avec des Pops publiés.
            </p>
          </div>

          {cityCards.length > 0 ? (
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {cityCards.map((d) => (
                <li key={d.slug}>
                  <Link
                    href={`/pop/${d.slug}`}
                    className="group block overflow-hidden rounded-3xl bg-white shadow-soft no-underline hover:shadow-lift"
                  >
                    <div className="relative aspect-[5/4] overflow-hidden">
                      <Image
                        src={takePhoto(d.photo, d.photo)}
                        alt={d.label}
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="object-cover transition-transform duration-700 group-hover:scale-[1.06]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-ink/50 via-transparent to-transparent" />
                      <LivePriceBadge
                        destCity={d.slug}
                        className="absolute right-3 top-3"
                      />
                      <p className="absolute bottom-3 left-3 text-xs font-bold uppercase tracking-wide text-cream">
                        {d.mood}
                      </p>
                    </div>
                    <div className="px-4 py-4">
                      <p className="text-lg font-extrabold text-ink">{d.label}</p>
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

      {/* Week-ends du moment */}
      {momentDeals.length > 0 ? (
        <section id="moment" className="py-14 sm:py-16">
          <div className="mx-auto max-w-pop px-5">
            <p className="text-sm font-bold text-accent">En ce moment</p>
            <h2 className="mt-1 text-2xl font-extrabold text-ink sm:text-3xl">
              Les week-ends du moment
            </h2>
            <ul className="mt-8 grid gap-5 sm:grid-cols-3">
              {momentDeals.slice(0, 3).map((it) => {
                const city = String(it.city_slug || 'paris')
                const cover = takePhoto(
                  it.cover_image,
                  cityImageUrl(city),
                )
                return (
                  <li key={it.id}>
                    <Link
                      href={`/pop/${city}/${encodeURIComponent(it.slug || it.id)}`}
                      className="group block overflow-hidden rounded-3xl bg-white shadow-soft no-underline hover:shadow-lift"
                    >
                      <div className="relative aspect-[4/3]">
                        <Image
                          src={cover}
                          alt=""
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                          sizes="33vw"
                        />
                        <LivePriceBadge
                          destCity={city}
                          className="absolute right-3 top-3"
                        />
                      </div>
                      <div className="px-4 py-3">
                        <p className="font-extrabold text-ink">
                          {polishPopTitle(
                            sanitizeUserFacingText(it.title) || it.title,
                          )}
                        </p>
                        <p className="mt-1 text-xs text-ink-muted">
                          {citySlugDisplayNameFr(city) || city}
                        </p>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      ) : null}

      {/* Featured pops */}
      {pops.length > 0 ? (
        <section className="bg-sand/40 py-14">
          <div className="mx-auto max-w-pop px-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-accent">Pops</p>
                <h2 className="mt-1 text-2xl font-extrabold text-ink">
                  Pops prêts à suivre
                </h2>
              </div>
              <Link
                href="/pop/paris"
                className="text-sm font-bold text-accent no-underline"
              >
                Voir plus →
              </Link>
            </div>
            <ul className="mt-8 grid gap-5 sm:grid-cols-3">
              {pops.slice(0, 3).map((it) => {
                const city = String(it.city_slug || 'paris')
                const cover = takePhoto(
                  it.cover_image,
                  cityImageUrl(city),
                )
                return (
                  <li key={it.id}>
                    <Link
                      href={`/pop/${city}/${encodeURIComponent(it.slug || it.id)}`}
                      className="group block overflow-hidden rounded-3xl bg-white shadow-soft no-underline hover:shadow-lift"
                    >
                      <div className="relative aspect-[4/3]">
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
                      </div>
                      <div className="px-4 py-3">
                        <p className="font-extrabold text-ink">
                          {polishPopTitle(
                            sanitizeUserFacingText(it.title) || it.title,
                          )}
                        </p>
                        <p className="mt-1 text-xs text-ink-muted">
                          {citySlugDisplayNameFr(city) || city}
                        </p>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      ) : null}

      {/* Final CTA — 2nd store badges occurrence */}
      <section className="relative py-12 sm:py-16">
        <div className="relative z-10 mx-auto max-w-pop px-5">
          <div className="relative overflow-hidden rounded-[2rem] bg-accent-soft px-6 py-14 text-center sm:px-12">
            <h2 className="relative text-2xl font-extrabold tracking-tight text-ink sm:text-3xl lg:text-4xl">
              Ton prochain week-end t’attend
            </h2>
            <p className="relative mx-auto mt-3 max-w-sm text-sm text-ink-muted">
              Cherche un séjour, ouvre un Pop, invite ton groupe.
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

      <footer id="contact" className="border-t border-line bg-sand/50">
        <div className="mx-auto grid max-w-pop gap-10 px-5 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="flex items-center gap-2 text-lg font-extrabold text-ink">
              <PlaneLogo />
              Waypop
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              L’app des week-ends entre potes.
            </p>
          </div>
          {[
            {
              t: 'Produit',
              links: [
                { href: '/sejours', l: 'Séjours' },
                { href: '/pop/paris', l: 'Pops' },
                { href: '/alertes', l: 'Alertes' },
              ],
            },
            {
              t: 'Découvrir',
              links: [
                { href: '#how', l: 'Comment ça marche' },
                { href: '#destinations', l: 'Destinations' },
                { href: '#app', l: 'L’app' },
              ],
            },
            {
              t: 'Légal',
              links: [
                { href: '/mentions-legales', l: 'Mentions' },
                { href: '/confidentialite', l: 'Confidentialité' },
                { href: 'mailto:hello@waypop.co', l: 'Contact' },
              ],
            },
          ].map((col) => (
            <div key={col.t}>
              <p className="text-sm font-extrabold text-ink">{col.t}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.l}>
                    <a
                      href={link.href}
                      className="text-sm text-ink-muted no-underline hover:text-accent"
                    >
                      {link.l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-line px-5 py-4 text-center text-xs text-ink-muted">
          © {new Date().getFullYear()} Waypop
        </div>
      </footer>
    </div>
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
