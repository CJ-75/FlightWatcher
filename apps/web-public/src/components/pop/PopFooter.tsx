import Link from 'next/link'

export function PopFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-line bg-surface/80 px-5 py-10 text-xs text-muted">
      <div className="mx-auto flex max-w-pop flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-brand text-ink">
            Waypop
          </p>
          <p className="mt-2">© {year} · cartes © OpenStreetMap</p>
        </div>
        <nav className="flex flex-wrap gap-5">
          <Link
            href="/mentions-legales"
            className="font-semibold text-ink-soft no-underline hover:underline"
          >
            Mentions légales
          </Link>
          <Link
            href="/confidentialite"
            className="font-semibold text-ink-soft no-underline hover:underline"
          >
            Confidentialité
          </Link>
        </nav>
      </div>
    </footer>
  )
}
