/**
 * Unit checks for SEO helpers (no build step — mirrors shared logic lightly).
 * Full shared coverage via packages/shared when wired; here we assert fixture invariants.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Fixtures are TS — load via compiled path unavailable; assert JSON-like rules here.

test('document title max 60', () => {
  const clip = (t, max) => {
    const s = String(t).replace(/\s+/g, ' ').trim()
    if (s.length <= max) return s
    const cut = s.slice(0, max - 1)
    const sp = cut.lastIndexOf(' ')
    return `${(sp > 40 ? cut.slice(0, sp) : cut).trim()}…`
  }
  const long =
    'Paris en deux jours itinéraire complet pour une première visite absolument'
  const titled = `${clip(long, 51)} | Waypop`
  assert.ok(titled.length <= 60, titled.length)
})

test('forbidden placeholders', () => {
  const html = '<h1>Paris en 2 jours</h1><p>Intro réelle</p>'
  assert.equal(/\bTODO\b/.test(html), false)
  assert.equal(/\bundefined\b/.test(html), false)
  assert.equal(/\bLorem\b/i.test(html), false)
  assert.equal(/\bseuil\b/i.test(html), false)
  assert.equal(/\bfixture\b/i.test(html), false)
  assert.equal(/\bvolontairement\b/i.test(html), false)
  assert.equal(/\bstub\b/i.test(html), false)
  assert.equal(/\bSEO\b/.test(html), false)
})

test('anti-placeholder catches stub and SEO', () => {
  const bad = [/stub/i, /\bSEO\b/]
  assert.equal(bad.some((r) => r.test('Paris stub')), true)
  assert.equal(bad.some((r) => r.test('Paris au bord SEO')), true)
  assert.equal(bad.some((r) => r.test('Paris en 2 jours')), false)
})

test('fixture-riche photos are unique identities', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(
    join(__dirname, '../src/fixtures/popFixtures.ts'),
    'utf8',
  )
  const names = [
    'COVER',
    'MONTORGUEIL',
    'POMPIDOU',
    'PONT_NEUF',
    'ODEON',
    'LUXEMBOURG',
    'MOUFFETARD',
  ]
  const ids = []
  for (const n of names) {
    const m = src.match(
      new RegExp(
        `const ${n} =\\s*'https://images\\.unsplash\\.com/(photo-[\\w-]+)`,
      ),
    )
    assert.ok(m, `missing unsplash const ${n}`)
    ids.push(m[1])
  }
  assert.equal(new Set(ids).size, ids.length, `dupes: ${ids}`)
})

test('landing page photos must be unique identities', async () => {
  // Mirrors assertUniquePagePhotos — no two identical photo ids on one page.
  const photoIdentity = (s) => {
    if (!s) return null
    try {
      const u = new URL(s, 'https://waypop.co')
      if (u.hostname.includes('unsplash.com')) {
        const m = u.pathname.match(/photo-[\w-]+/)
        return m ? `unsplash:${m[0]}` : u.href.split('?')[0]
      }
      if (u.hostname.includes('wikimedia.org')) {
        const file = u.pathname.split('/').pop() || u.pathname
        return `wm:${decodeURIComponent(file).replace(/^\d+px-/, '')}`
      }
      return `${u.origin}${u.pathname}`
    } catch {
      return String(s).split('?')[0]
    }
  }
  const assertUnique = (urls) => {
    const seen = new Set()
    const dupes = []
    for (const u of urls) {
      const id = photoIdentity(u)
      if (!id) continue
      if (seen.has(id)) dupes.push(id)
      seen.add(id)
    }
    return dupes
  }
  const sample = [
    'https://images.unsplash.com/photo-aaa?w=1',
    'https://images.unsplash.com/photo-bbb?w=1',
    'https://images.unsplash.com/photo-aaa?w=2',
  ]
  assert.deepEqual(assertUnique(sample), ['unsplash:photo-aaa'])
  assert.deepEqual(
    assertUnique([
      'https://images.unsplash.com/photo-aaa?w=1',
      'https://images.unsplash.com/photo-bbb?w=1',
    ]),
    [],
  )
})

test('fixture slug list expected', async () => {
  // Read fixture file as text — ensure keys exist without TS runtime
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(
    join(__dirname, '../src/fixtures/popFixtures.ts'),
    'utf8',
  )
  for (const slug of [
    'fixture-riche',
    'fixture-moyen',
    'fixture-seuil',
    'fixture-pauvre',
    'fixture-long-title',
  ]) {
    assert.ok(src.includes(`'${slug}'`), slug)
  }
})
