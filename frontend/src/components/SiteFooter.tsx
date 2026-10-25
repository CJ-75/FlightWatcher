import { Link } from 'react-router-dom'

/** Minimal legal footer — P2 audit. */
export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-line pt-6 pb-10 text-center text-xs text-muted space-y-2">
      <p className="font-semibold text-ink-soft">FlightWatcher</p>
      <p className="max-w-md mx-auto leading-relaxed">
        Vol et hôtel sont deux réservations distinctes. Les prix vols sont indicatifs
        jusqu’à confirmation chez le partenaire.
      </p>
      <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-1" aria-label="Informations légales">
        <Link to="/recherche" className="hover:text-primary-600 underline-offset-2 hover:underline">
          Recherche
        </Link>
        <Link to="/deals" className="hover:text-primary-600 underline-offset-2 hover:underline">
          Deals
        </Link>
        <a
          href="mailto:hello@flightwatcher.app"
          className="hover:text-primary-600 underline-offset-2 hover:underline"
        >
          Contact
        </a>
        <span className="text-slate-400">Mentions légales · CGU · Confidentialité (bientôt)</span>
      </nav>
    </footer>
  )
}
