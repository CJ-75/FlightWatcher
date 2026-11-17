import React from 'react'
import { fwColor } from '../design/tokens'

export type SiteFooterLink = {
  href: string
  label: string
  external?: boolean
}

export type SiteFooterProps = {
  className?: string
  id?: string
}

export const SITE_FOOTER_LINKS: SiteFooterLink[] = [
  { href: '/sejours', label: 'Séjours' },
  { href: '/parcours', label: 'Pops' },
  { href: '/vols', label: 'Vols' },
  { href: '/mentions-legales', label: 'Mentions' },
  { href: '/confidentialite', label: 'Confidentialité' },
  { href: 'mailto:hello@waypop.co', label: 'Contact', external: true },
]

const c = fwColor.light

/** Scoped styles — identical on Next + Vite (no Tailwind content scan). */
const FOOTER_CSS = `
.wp-site-footer {
  border-top: 1px solid ${c.line};
  background: transparent;
}
.wp-site-footer__inner {
  box-sizing: border-box;
  max-width: 72rem;
  margin: 0 auto;
  padding: 0.875rem 1.25rem;
  display: flex;
  flex-direction: column;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  text-align: center;
  row-gap: 0.4rem;
}
.wp-site-footer__brand {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: ${c.inkMuted};
  white-space: nowrap;
}
.wp-site-footer__brand strong {
  font-weight: 600;
  color: ${c.ink};
}
.wp-site-footer__dot {
  margin: 0 0.4rem;
  opacity: 0.4;
}
.wp-site-footer__nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  column-gap: 0.875rem;
  row-gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.wp-site-footer__nav a {
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  color: ${c.inkMuted} !important;
  text-decoration: none !important;
}
.wp-site-footer__nav a:hover {
  color: ${c.accent} !important;
  text-decoration: none !important;
}
`

/**
 * Shared lean footer for Next (web-public) + Vite (frontend).
 * Layout/colors via scoped CSS so both stacks match (Next global `a` override).
 */
export function SiteFooter({ className, id = 'contact' }: SiteFooterProps) {
  const year = new Date().getFullYear()
  const root = ['wp-site-footer', className].filter(Boolean).join(' ')

  return (
    <footer id={id} className={root}>
      <style dangerouslySetInnerHTML={{ __html: FOOTER_CSS }} />
      <div className="wp-site-footer__inner">
        <p className="wp-site-footer__brand">
          <strong>Waypop</strong>
          <span className="wp-site-footer__dot">·</span>© {year}
        </p>
        <nav aria-label="Pied de page">
          <ul className="wp-site-footer__nav">
            {SITE_FOOTER_LINKS.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  {...(link.external ? { rel: 'noopener noreferrer' } : {})}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  )
}
