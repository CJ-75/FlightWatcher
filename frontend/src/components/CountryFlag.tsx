import { useMemo, useState } from 'react'

/** French / English country labels → ISO 3166-1 alpha-2 (lowercase for flagcdn). */
const COUNTRY_TO_ISO: Record<string, string> = {
  france: 'fr',
  'royaume-uni': 'gb',
  'united kingdom': 'gb',
  uk: 'gb',
  england: 'gb',
  espagne: 'es',
  spain: 'es',
  italie: 'it',
  italy: 'it',
  allemagne: 'de',
  germany: 'de',
  portugal: 'pt',
  grece: 'gr',
  greece: 'gr',
  irlande: 'ie',
  ireland: 'ie',
  belgique: 'be',
  belgium: 'be',
  'pays-bas': 'nl',
  netherlands: 'nl',
  holland: 'nl',
  suisse: 'ch',
  switzerland: 'ch',
  autriche: 'at',
  austria: 'at',
  pologne: 'pl',
  poland: 'pl',
  'republique tcheque': 'cz',
  czechia: 'cz',
  'czech republic': 'cz',
  hongrie: 'hu',
  hungary: 'hu',
  roumanie: 'ro',
  romania: 'ro',
  bulgarie: 'bg',
  bulgaria: 'bg',
  croatie: 'hr',
  croatia: 'hr',
  slovenie: 'si',
  slovenia: 'si',
  slovaquie: 'sk',
  slovakia: 'sk',
  danemark: 'dk',
  denmark: 'dk',
  suede: 'se',
  sweden: 'se',
  norvege: 'no',
  norway: 'no',
  finlande: 'fi',
  finland: 'fi',
  albanie: 'al',
  albania: 'al',
  'bosnie-herzegovine': 'ba',
  'bosnia and herzegovina': 'ba',
  chypre: 'cy',
  cyprus: 'cy',
  estonie: 'ee',
  estonia: 'ee',
  lituanie: 'lt',
  lithuania: 'lt',
  luxembourg: 'lu',
  lettonie: 'lv',
  latvia: 'lv',
  montenegro: 'me',
  malte: 'mt',
  malta: 'mt',
  serbie: 'rs',
  serbia: 'rs',
  turquie: 'tr',
  turkey: 'tr',
  maroc: 'ma',
  morocco: 'ma',
  jordanie: 'jo',
  jordan: 'jo',
  islande: 'is',
  iceland: 'is',
  'macedoine du nord': 'mk',
  'north macedonia': 'mk',
  kosovo: 'xk',
  ukraine: 'ua',
  moldavie: 'md',
  moldova: 'md',
  georgie: 'ge',
  georgia: 'ge',
  israel: 'il',
  egypte: 'eg',
  egypt: 'eg',
  tunisie: 'tn',
  tunisia: 'tn',
  algerie: 'dz',
  algeria: 'dz',
}

function normalizeCountryKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/\s+/g, ' ')
}

export function countryToFlagIso(country?: string | null): string | null {
  if (!country) return null
  const key = normalizeCountryKey(country)
  if (/^[a-z]{2}$/.test(key)) return key === 'uk' ? 'gb' : key
  return COUNTRY_TO_ISO[key] || null
}

type Props = {
  country?: string | null
  className?: string
  title?: string
}

/** Raster flag via flagcdn — reliable on Windows (unlike regional-indicator emoji). */
export function CountryFlag({ country, className, title }: Props) {
  const iso = useMemo(() => countryToFlagIso(country), [country])
  const [failed, setFailed] = useState(false)

  if (!iso || failed) {
    return (
      <span
        className={`inline-block rounded-[2px] bg-slate-200 ring-1 ring-black/10 shrink-0 ${className || 'w-[18px] h-3'}`}
        title={title || country || undefined}
        aria-hidden
      />
    )
  }

  return (
    <img
      src={`https://flagcdn.com/w40/${iso}.png`}
      srcSet={`https://flagcdn.com/w80/${iso}.png 2x`}
      alt=""
      title={title || country || undefined}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`inline-block object-cover rounded-[2px] shadow-sm ring-1 ring-black/10 shrink-0 ${
        className || 'w-[18px] h-3'
      }`}
      aria-hidden
    />
  )
}
