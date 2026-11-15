import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const API =
  process.env.WAYPOP_API_URL ||
  process.env.NEXT_PUBLIC_WAYPOP_API_URL ||
  'https://api.waypop.co'

async function readFlags(): Promise<{
  pop: boolean
  landing: boolean
}> {
  try {
    const res = await fetch(`${API.replace(/\/$/, '')}/api/config`, {
      next: { revalidate: 15 },
    })
    if (!res.ok) return { pop: false, landing: false }
    const cfg = (await res.json()) as Record<string, unknown>
    return {
      pop: cfg.pop_page_v2_enabled === true,
      landing: cfg.landing_v2_enabled === true,
    }
  } catch {
    return { pop: false, landing: false }
  }
}

function previewVersion(
  req: NextRequest,
  param: 'pop_v' | 'landing_v',
  cookieName: string,
): { version: 1 | 2 | null; res: NextResponse | null } {
  const raw = req.nextUrl.searchParams.get(param)
  if (raw === 'reset') {
    const url = req.nextUrl.clone()
    url.searchParams.delete(param)
    const res = NextResponse.redirect(url)
    res.cookies.set(cookieName, '', { path: '/', maxAge: 0 })
    return { version: null, res }
  }
  if (raw === '1' || raw === '2') {
    const url = req.nextUrl.clone()
    url.searchParams.delete(param)
    const res = NextResponse.redirect(url)
    res.cookies.set(cookieName, raw, {
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
      sameSite: 'lax',
    })
    return { version: Number(raw) as 1 | 2, res }
  }
  const c = req.cookies.get(cookieName)?.value
  if (c === '1' || c === '2') return { version: Number(c) as 1 | 2, res: null }
  return { version: null, res: null }
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get('host') || ''
  // No indexable content on *.vercel.app
  if (host.endsWith('.vercel.app')) {
    const res = NextResponse.next()
    res.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return res
  }

  const { pathname } = req.nextUrl
  const flags = await readFlags()

  // Landing
  if (pathname === '/') {
    const prev = previewVersion(req, 'landing_v', 'landing_v')
    if (prev.res) return prev.res
    const useV2 =
      prev.version === 2 || (prev.version !== 1 && flags.landing)
    if (!useV2) {
      const url = req.nextUrl.clone()
      url.pathname = '/sejours'
      return NextResponse.redirect(url, 307)
    }
    if (req.cookies.get('wp_signed_in')?.value === '1') {
      const url = req.nextUrl.clone()
      url.pathname = '/sejours'
      return NextResponse.redirect(url, 307)
    }
    const res = NextResponse.next()
    if (prev.version) {
      res.headers.set('X-Robots-Tag', 'noindex, follow')
      res.headers.set('x-waypop-preview', `landing_v${prev.version}`)
    }
    return res
  }

  // Pop pages
  if (pathname.startsWith('/pop/')) {
    const prev = previewVersion(req, 'pop_v', 'pop_v')
    if (prev.res) return prev.res
    const useV2 = prev.version === 2 || (prev.version !== 1 && flags.pop)
    if (!useV2) {
      // /pop/{ville}/{slug} → /parcours/{slug} ; /pop/{ville} → /parcours
      const parts = pathname.split('/').filter(Boolean)
      const url = req.nextUrl.clone()
      if (parts.length >= 3) {
        url.pathname = `/parcours/${parts[2]}`
      } else {
        url.pathname = '/parcours'
      }
      return NextResponse.redirect(url, 302)
    }
    const res = NextResponse.next()
    if (prev.version) {
      res.headers.set('X-Robots-Tag', 'noindex, follow')
      res.headers.set('x-waypop-preview', `pop_v${prev.version}`)
    }
    return res
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/pop/:path*'],
}
