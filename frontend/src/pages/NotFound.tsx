import { Link, useLocation } from 'react-router-dom'

export default function NotFound() {
  const location = useLocation()
  const path = location.pathname + location.search

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FFF9F5]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 h-80 w-80 rounded-full bg-[#FF6B35]/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 -left-20 h-72 w-72 rounded-full bg-[#FFB088]/20 blur-3xl"
      />

      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-16 sm:px-8">
        <p className="mb-3 text-[11px] font-black uppercase tracking-[0.16em] text-[#E85A28]">
          FlightWatcher
        </p>
        <p className="font-extrabold text-[72px] leading-none tracking-tight text-[#FF6B35] sm:text-[88px]">
          404
        </p>
        <h1 className="mt-3 font-extrabold text-3xl tracking-tight text-ink sm:text-4xl">
          Page introuvable
        </h1>
        <p className="mt-3 max-w-md text-base leading-relaxed text-muted">
          Ce lien ne mène nulle part — peut‑être un séjour déjà parti, ou une URL un peu
          perdue.
        </p>

        {path && path !== '/' ? (
          <div className="mt-6 rounded-2xl border border-line bg-white px-4 py-3 shadow-soft">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
              Chemin
            </p>
            <p className="mt-1 break-all text-sm font-medium text-ink-soft">{path}</p>
          </div>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            to="/vols"
            className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-primary-500 px-5 text-base font-bold text-white hover:bg-primary-600"
          >
            Retour aux vols
          </Link>
          <Link
            to="/sejours"
            className="inline-flex min-h-[44px] items-center justify-center px-3 text-sm font-bold text-primary-700 hover:text-primary-600"
          >
            Voir les séjours
          </Link>
        </div>
      </div>
    </div>
  )
}
