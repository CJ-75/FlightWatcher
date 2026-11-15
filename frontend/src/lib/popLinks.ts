/**
 * Public Pop URLs — SPA stays on /parcours until POP_PAGE_V2 is on.
 */
import { peekConfigFlag } from './configFlags'

export function publicPopPath(opts: {
  citySlug?: string | null
  slug?: string | null
  id?: string | null
}): string {
  const city = String(opts.citySlug || '')
    .trim()
    .toLowerCase()
  const slug = String(opts.slug || opts.id || '')
    .trim()
    .toLowerCase()
  if (peekConfigFlag('pop_page_v2_enabled') && city && slug) {
    return `/pop/${encodeURIComponent(city)}/${encodeURIComponent(slug)}`
  }
  return `/parcours/${encodeURIComponent(opts.slug || opts.id || '')}`
}
