import Link from 'next/link'
import { citySlugDisplayNameFr } from '@waypop/shared'
import { fetchPublishedByCity } from '@/lib/parcoursApi'
import { Card } from '@/components/ui/Card'

type Props = { params: Promise<{ ville: string }> }

export default async function PopCityPage({ params }: Props) {
  const { ville } = await params
  const city = decodeURIComponent(ville).toLowerCase()
  const list = await fetchPublishedByCity(city)
  const label = citySlugDisplayNameFr(city) || city

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 space-y-6">
      <nav className="text-sm text-muted">
        <Link href="/pop/paris" className="no-underline hover:underline">
          Pops
        </Link>
        <span className="mx-1.5">›</span>
        <span className="text-ink font-semibold">{label}</span>
      </nav>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">
        Que faire à {label} le week-end
      </h1>
      <p className="text-muted text-sm">
        Hub ville (Lot 1 shell). Intro, quartiers et groupement par intention au
        Lot 2.
      </p>
      <ul className="space-y-3">
        {list.map((it) => (
          <li key={it.id}>
            <Card className="p-4">
              <Link
                href={`/pop/${city}/${encodeURIComponent(it.slug || it.id)}`}
                className="font-extrabold text-ink no-underline hover:underline"
              >
                {it.title}
              </Link>
              {it.subtitle ? (
                <p className="mt-1 text-sm text-muted line-clamp-2">
                  {it.subtitle}
                </p>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
      {!list.length ? (
        <p className="text-sm text-muted">Aucun Pop publié pour {label}.</p>
      ) : null}
    </main>
  )
}
