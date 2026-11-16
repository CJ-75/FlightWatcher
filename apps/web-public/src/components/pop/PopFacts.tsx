type Fact = { label: string; value: string }

/** Ultra-light meta line — values only, quiet separators. */
export function PopFacts({ facts }: { facts: Fact[] }) {
  const list = facts.slice(0, 4)
  if (!list.length) return null

  return (
    <p
      className="text-[14px] font-medium leading-relaxed tracking-tight text-ink/80"
      aria-label={list.map((f) => `${f.label} : ${f.value}`).join(' · ')}
    >
      {list.map((f, i) => (
        <span key={f.label}>
          {i > 0 ? (
            <span className="mx-2.5 text-ink/25" aria-hidden>
              ·
            </span>
          ) : null}
          <span className="text-ink">{f.value}</span>
        </span>
      ))}
    </p>
  )
}
