import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { absolute: 'Page introuvable | Waypop' },
  robots: { index: false, follow: true },
}

/** Mirror SPA `frontend/src/pages/NotFound.tsx` — peach canvas, same copy hierarchy. */
export default function NotFound() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FFF9F5]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-24 h-80 w-80 rounded-full bg-[#FF6B35]/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 bottom-0 h-72 w-72 rounded-full bg-[#FFB088]/20 blur-3xl"
      />

      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-16 sm:px-8">
        <p className="mb-3 text-[11px] font-black uppercase tracking-[0.16em] text-[#E85A28]">
          WayPop
        </p>
        <p className="text-[72px] font-extrabold leading-none tracking-tight text-[#FF6B35] sm:text-[88px]">
          404
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          Page introuvable
        </h1>
        <p className="mt-3 max-w-md text-base leading-relaxed text-ink-muted">
          Ce lien ne mène nulle part. Peut‑être un séjour déjà parti, ou une URL
          un peu perdue.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/"
            className="wp-cta-ink inline-flex min-h-[48px] items-center justify-center px-5 text-base no-underline"
          >
            Retour à l’accueil
          </Link>
          <Link
            href="/sejours"
            className="inline-flex min-h-[44px] items-center justify-center px-3 text-sm font-bold text-[#E85A28] no-underline hover:text-[#FF6B35]"
          >
            Voir les week-ends
          </Link>
        </div>
      </div>
    </div>
  )
}
