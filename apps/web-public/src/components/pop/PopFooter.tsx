import Link from 'next/link'

export function PopFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-line bg-white/60 px-5 py-8 text-xs text-muted">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>© {year} Waypop · cartes © OpenStreetMap</p>
        <nav className="flex flex-wrap gap-4">
          <Link href="/mentions-legales" className="no-underline hover:underline">
            Mentions légales
          </Link>
          <Link href="/confidentialite" className="no-underline hover:underline">
            Confidentialité
          </Link>
        </nav>
      </div>
    </footer>
  )
}
