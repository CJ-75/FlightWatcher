/**
 * Surtitre orange en capitales — jeton partagé (§8.2).
 */
export function FwKicker({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p
      className={`m-0 text-[12px] font-bold uppercase tracking-[0.08em] ${className}`}
      style={{ color: 'var(--fw-accent)' }}
    >
      {children}
    </p>
  )
}
