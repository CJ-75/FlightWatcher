/** Blue verified badge (Twitter-style) — Pop author only. */

export function VerifiedBadge({
  className = '',
  size = 16,
}: {
  className?: string
  size?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      className={`inline-block shrink-0 ${className}`}
      aria-label="Certifié"
      role="img"
    >
      <title>Certifié</title>
      <circle cx="11" cy="11" r="11" fill="#1D9BF0" />
      <path
        d="M9.6 14.85 6.4 11.65l1.2-1.2 2 2 4.8-4.8 1.2 1.2-6 6z"
        fill="#fff"
      />
    </svg>
  )
}

/** Pop author line: Waypop + blue check (admin pops). */
export function PopAuthor({
  authorKind,
  className = '',
  textClassName = 'text-[11px] font-semibold uppercase tracking-brand text-white/75',
  verifiedDate,
}: {
  authorKind?: string | null
  className?: string
  textClassName?: string
  verifiedDate?: string | null
}) {
  const isWaypop = String(authorKind || 'admin') !== 'user'
  const name = isWaypop ? 'Waypop' : 'Communauté'

  return (
    <p className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className={`inline-flex items-center gap-1 ${textClassName}`}>
        <span>Par {name}</span>
        {isWaypop ? <VerifiedBadge size={14} /> : null}
      </span>
      {verifiedDate ? (
        <span className={textClassName}>· vérifié le {verifiedDate}</span>
      ) : null}
    </p>
  )
}
