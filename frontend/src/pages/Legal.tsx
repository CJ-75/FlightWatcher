/**
 * Pages légales publiques — Privacy / CGU / Mentions.
 * Contenu soft-launch ; à faire valider juridiquement avant scale.
 */
import { Link, useLocation } from 'react-router-dom'
import { SiteFooter } from '../components/SiteFooter'

type DocId = 'privacy' | 'terms' | 'legal'

const DOCS: Record<
  DocId,
  { title: string; updated: string; sections: { h: string; p: string[] }[] }
> = {
  privacy: {
    title: 'Politique de confidentialité',
    updated: '5 novembre 2026',
    sections: [
      {
        h: 'Qui sommes-nous',
        p: [
          'FlightWatcher (« nous ») propose une application et un site pour trouver des week-ends abordables (vols, séjours, organisation de voyage).',
          'Contact : hello@flightwatcher.app',
        ],
      },
      {
        h: 'Données collectées',
        p: [
          'Compte : adresse e-mail, identifiant technique, éventuellement nom affiché via Google.',
          'Usage : recherches, favoris, voyages / planner, brouillons « Mon voyage », réservations d’hôtel initiées dans l’app.',
          'Technique : logs serveur, événements analytiques internes (parcours de réservation), données de session.',
          'Paiement hôtel : traité par LiteAPI / partenaires de paiement — nous ne stockons pas le numéro de carte.',
        ],
      },
      {
        h: 'Finalités',
        p: [
          'Fournir le service (recherche, planner, réservation hôtel, synchronisation web/app).',
          'Sécuriser le compte et prévenir la fraude.',
          'Améliorer le produit (statistiques agrégées).',
          'Répondre aux obligations légales.',
        ],
      },
      {
        h: 'Base légale & conservation',
        p: [
          'Exécution du contrat / intérêt légitime pour le fonctionnement du service ; consentement le cas échéant.',
          'Les données de compte sont conservées tant que le compte existe. Tu peux demander la suppression depuis Compte → Sécurité.',
          'Les réservations peuvent être conservées le temps nécessaire aux obligations comptables / litiges.',
        ],
      },
      {
        h: 'Partage',
        p: [
          'Prestataires techniques : hébergement, auth (Supabase), e-mails transactionnels, LiteAPI pour l’hôtel, compagnies / partenaires pour les vols (redirection hors app).',
          'Pas de vente de données personnelles.',
        ],
      },
      {
        h: 'Tes droits',
        p: [
          'Accès, rectification, suppression, opposition, portabilité — selon la réglementation applicable (ex. RGPD).',
          'Pour exercer un droit : hello@flightwatcher.app, ou suppression de compte dans l’app (Sécurité).',
        ],
      },
    ],
  },
  terms: {
    title: 'Conditions générales d’utilisation',
    updated: '5 novembre 2026',
    sections: [
      {
        h: 'Objet',
        p: [
          'Les présentes CGU régissent l’accès à FlightWatcher (web et application mobile).',
          'En créant un compte ou en utilisant le service, tu acceptes ces conditions.',
        ],
      },
      {
        h: 'Service',
        p: [
          'FlightWatcher aide à comparer des offres de voyage et à organiser un séjour. Les prix et disponibilités peuvent changer jusqu’à la confirmation chez le partenaire.',
          'Les vols sont généralement réservés chez la compagnie ou un partenaire (hors app). Les hôtels peuvent être réservés via LiteAPI dans l’app lorsque le paiement est activé.',
        ],
      },
      {
        h: 'Compte',
        p: [
          'Tu es responsable de la confidentialité de ton accès. Un usage frauduleux ou abusif peut entraîner la suspension du compte.',
          'Tu peux supprimer ton compte depuis Compte → Sécurité.',
        ],
      },
      {
        h: 'Réservations & paiements',
        p: [
          'Vol et hôtel sont des prestations distinctes. Les conditions d’annulation / remboursement de l’hôtel s’appliquent selon la politique affichée au moment de la réservation.',
          'FlightWatcher n’est pas la compagnie aérienne ; pour un vol, le contrat est conclu avec le partenaire de réservation.',
        ],
      },
      {
        h: 'Limitation',
        p: [
          'Le service est fourni « en l’état ». Nous mettons tout en œuvre pour afficher des infos exactes, sans garantir l’absence d’erreurs de partenaires tiers.',
          'Dans les limites autorisées par la loi, notre responsabilité est limitée aux dommages directs liés à un manquement prouvé au service FlightWatcher.',
        ],
      },
      {
        h: 'Contact',
        p: ['hello@flightwatcher.app'],
      },
    ],
  },
  legal: {
    title: 'Mentions légales',
    updated: '5 novembre 2026',
    sections: [
      {
        h: 'Éditeur',
        p: [
          'FlightWatcher — application et site de recherche / organisation de voyages.',
          'Contact : hello@flightwatcher.app',
          'Les informations d’éditeur / siège seront complétées dès formalisation de la structure juridique.',
        ],
      },
      {
        h: 'Hébergement',
        p: [
          'Le site et l’API sont hébergés via des prestataires cloud (infra applicative / base de données). Les détails d’hébergeur seront listés ici à la mise en production publique.',
        ],
      },
      {
        h: 'Propriété intellectuelle',
        p: [
          'Marque, interface et contenus FlightWatcher sont protégés. Toute reproduction non autorisée est interdite.',
        ],
      },
    ],
  },
}

function docFromPath(pathname: string): DocId {
  if (pathname.includes('privacy') || pathname.includes('confidentialite')) return 'privacy'
  if (pathname.includes('terms') || pathname.includes('cgu')) return 'terms'
  return 'legal'
}

export default function Legal() {
  const { pathname } = useLocation()
  const id = docFromPath(pathname)
  const doc = DOCS[id]

  return (
    <div className="min-h-screen bg-[#FFF9F5]">
      <div className="max-w-2xl mx-auto px-4 py-10 sm:py-14">
        <Link to="/vols" className="text-sm font-bold text-[#E85A28]">
          ← FlightWatcher
        </Link>
        <p className="app-kicker mt-8 mb-2">Légal</p>
        <h1 className="text-3xl font-extrabold text-ink tracking-tight">{doc.title}</h1>
        <p className="mt-2 text-sm text-muted">Dernière mise à jour : {doc.updated}</p>

        <nav className="mt-6 flex flex-wrap gap-3 text-sm font-semibold">
          <Link
            to="/privacy"
            className={id === 'privacy' ? 'text-primary-600' : 'text-muted hover:text-primary-600'}
          >
            Confidentialité
          </Link>
          <Link
            to="/terms"
            className={id === 'terms' ? 'text-primary-600' : 'text-muted hover:text-primary-600'}
          >
            CGU
          </Link>
          <Link
            to="/legal"
            className={id === 'legal' ? 'text-primary-600' : 'text-muted hover:text-primary-600'}
          >
            Mentions légales
          </Link>
        </nav>

        <div className="mt-10 space-y-8">
          {doc.sections.map((s) => (
            <section key={s.h} className="space-y-2">
              <h2 className="text-lg font-extrabold text-ink">{s.h}</h2>
              {s.p.map((para) => (
                <p key={para.slice(0, 48)} className="text-sm text-ink-soft leading-relaxed">
                  {para}
                </p>
              ))}
            </section>
          ))}
        </div>

        <SiteFooter />
      </div>
    </div>
  )
}
