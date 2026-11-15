/**
 * Lot 5 — flag / HTTP behaviour checks.
 * Env:
 *   BASE=https://waypop.co or http://localhost:3001
 *   API=https://api.waypop.co
 */
const BASE = (process.env.BASE || 'http://localhost:3001').replace(/\/$/, '')
const API = (process.env.API || 'http://localhost:8000').replace(/\/$/, '')

function ok(m) {
  console.log(`OK: ${m}`)
}
function fail(m) {
  console.error(`FAIL: ${m}`)
  process.exitCode = 1
}

async function main() {
  // Config flags readable
  try {
    const cfg = await fetch(`${API}/api/config`).then((r) => r.json())
    ok(
      `config pop_page_v2=${cfg.pop_page_v2_enabled} landing_v2=${cfg.landing_v2_enabled}`,
    )
  } catch (e) {
    fail(`api /api/config unreachable: ${e.message}`)
  }

  // Dev edge always 200 + noindex
  try {
    const r = await fetch(`${BASE}/dev/pop-edge`)
    if (r.status !== 200) fail(`dev/pop-edge HTTP ${r.status}`)
    else ok('dev/pop-edge 200')
    const robots = r.headers.get('x-robots-tag') || ''
    if (!/noindex/i.test(robots)) fail('dev/pop-edge missing X-Robots-Tag noindex')
    else ok('dev X-Robots-Tag')
  } catch (e) {
    fail(`dev/pop-edge: ${e.message}`)
  }

  // Unknown pop → 404 (when V2 on / preview)
  try {
    const r = await fetch(`${BASE}/pop/paris/slug-qui-nexiste-pas-xyz`, {
      redirect: 'manual',
    })
    // May 302 to parcours if flag off, or 404 if on
    if ([302, 307, 404, 301].includes(r.status)) {
      ok(`unknown pop status ${r.status} (flag-dependent)`)
    } else {
      fail(`unexpected status for unknown pop: ${r.status}`)
    }
  } catch (e) {
    fail(`unknown pop: ${e.message}`)
  }

  // Sitemap reachable
  try {
    const r = await fetch(`${BASE}/sitemap.xml`)
    if (!r.ok) fail(`sitemap.xml ${r.status}`)
    else ok('sitemap.xml')
  } catch (e) {
    fail(`sitemap: ${e.message}`)
  }

  if (process.exitCode) {
    console.error('\nAcceptance flags: FAILED')
    process.exit(1)
  }
  console.log('\nAcceptance flags: PASSED')
}

main()
