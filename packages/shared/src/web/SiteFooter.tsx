import React from 'react'

export type SiteFooterLink = {
  href: string
  label: string
  external?: boolean
}

export type SiteFooterColumn = {
  title: string
  links: SiteFooterLink[]
}

export type SiteFooterProps = {
  className?: string
  id?: string
}

export const SITE_FOOTER_TAGLINE = 'L’app des week-ends déjà organisés.'

export const SITE_FOOTER_COLUMNS: SiteFooterColumn[] = [
  {
    title: 'Produit',
    links: [
      { href: '/sejours', label: 'Séjours' },
      { href: '/parcours', label: 'Pops' },
      { href: '/vols', label: 'Vols' },
      { href: '/alertes', label: 'Alertes' },
    ],
  },
  {
    title: 'Découvrir',
    links: [
      { href: '/#how', label: 'Comment ça marche' },
      { href: '/#destinations', label: 'Destinations' },
      { href: '/#pops', label: 'Pops' },
      { href: '/#alertes', label: 'Alertes' },
    ],
  },
  {
    title: 'Légal',
    links: [
      { href: '/mentions-legales', label: 'Mentions légales' },
      { href: '/cgu', label: 'CGU' },
      { href: '/confidentialite', label: 'Confidentialité' },
      { href: 'mailto:hello@waypop.co', label: 'Contact', external: true },
    ],
  },
]

function PlaneMark() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-cream shadow-lift">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M10 14L3 11l18-7-7 18-3-7-4-1z" fill="currentColor" />
      </svg>
    </span>
  )
}

/**
 * Unique web footer for Next (web-public) + Vite (frontend).
 * Plain <a> so neither next/link nor react-router is required.
 *
 * Note: keep data in this file — on Windows `./siteFooter` collides with
 * `./SiteFooter.tsx` (case-insensitive FS → circular import).
 */
export function SiteFooter({ className, id = 'contact' }: SiteFooterProps) {
  const year = new Date().getFullYear()
  const root = ['border-t border-line bg-sand/50', className]
    .filter(Boolean)
    .join(' ')

  return (
    <footer id={id} className={root}>
      <div className="mx-auto grid max-w-pop gap-10 px-5 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="flex items-center gap-2 text-lg font-extrabold text-ink">
            <PlaneMark />
            Waypop
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            {SITE_FOOTER_TAGLINE}
          </p>
        </div>
        {SITE_FOOTER_COLUMNS.map((col) => (
          <div key={col.title}>
            <p className="text-sm font-extrabold text-ink">{col.title}</p>
            <ul className="mt-3 space-y-2">
              {col.links.map((link) => (
                <li key={`${col.title}-${link.label}`}>
                  <a
                    href={link.href}
                    className="text-sm text-ink-muted no-underline hover:text-accent"
                    {...(link.external
                      ? { rel: 'noopener noreferrer' }
                      : {})}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line px-5 py-4 text-center text-xs text-ink-muted">
        © {year} Waypop
      </div>
    </footer>
  )
}
