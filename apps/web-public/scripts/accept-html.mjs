/**
 * Lot 5 — HTML acceptance checks (blocking).
 * Usage:
 *   node scripts/accept-html.mjs [url]
 * Default: http://localhost:3001/dev/pop-fixtures/fixture-riche
 */
const url =
  process.argv[2] ||
  'http://localhost:3001/dev/pop-fixtures/fixture-riche'

const FORBIDDEN = [
  /\bTODO\b/,
  /\bLorem\b/i,
  /\bundefined\b/,
  /\[placeholder\]/i,
  /\{title\}/,
]

/** Never on production Pop pages — allowed on /dev/ fixtures only */
const FORBIDDEN_PROD = [/\bseuil\b/i, /\bfixture\b/i, /\bvolontairement\b/i]

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  process.exitCode = 1
}

function ok(msg) {
  console.log(`OK: ${msg}`)
}

async function main() {
  console.log(`Fetching ${url}`)
  const res = await fetch(url)
  if (!res.ok) {
    fail(`HTTP ${res.status}`)
    return
  }
  const html = await res.text()

  if (!/<h1[\s>]/i.test(html)) fail('missing <h1>')
  else ok('h1 present')

  if (!/Programme/i.test(html)) fail('missing programme section')
  else ok('programme section')

  // Unique page images (cover + stops) — Unsplash photo- ids
  const photoIds = [...html.matchAll(/photo-[\w-]+/g)].map((m) => m[0])
  const uniq = new Set(photoIds)
  if (photoIds.length > 0 && uniq.size < photoIds.length) {
    fail(`duplicate photos on page (${photoIds.length} vs ${uniq.size} unique)`)
  } else if (photoIds.length > 0) {
    ok(`unique photos: ${uniq.size}`)
  }

  // All days/stops should be in HTML even if tabs hide some
  const stopMarkers = (html.match(/Stop \d+|Matin|Après-midi|Soir|Arrêt/gi) || [])
    .length
  if (stopMarkers < 1) fail('no stop markers in HTML')
  else ok(`stop-ish markers: ${stopMarkers}`)

  if (!/application\/ld\+json/i.test(html)) fail('missing JSON-LD')
  else ok('JSON-LD script')

  if (!/TouristTrip|BreadcrumbList/i.test(html)) fail('JSON-LD missing types')
  else ok('JSON-LD types')

  for (const re of FORBIDDEN) {
    if (re.test(html)) fail(`forbidden pattern ${re}`)
  }
  if (!url.includes('/dev/')) {
    for (const re of FORBIDDEN_PROD) {
      if (re.test(html)) fail(`prod-forbidden pattern ${re}`)
    }
  }
  if (process.exitCode !== 1) ok('no placeholder leaks')

  const robots = res.headers.get('x-robots-tag') || ''
  if (url.includes('/dev/') && !/noindex/i.test(robots + html)) {
    fail('dev fixture should be noindex')
  } else if (url.includes('/dev/')) {
    ok('dev noindex')
  }

  if (process.exitCode) {
    console.error('\nAcceptance HTML: FAILED')
    process.exit(1)
  }
  console.log('\nAcceptance HTML: PASSED')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
