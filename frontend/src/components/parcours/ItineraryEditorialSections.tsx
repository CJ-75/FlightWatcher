import {
  idealLabelFr,
  paceLabelFr,
  parseFaq,
  parseStay,
  parseTips,
  sanitizeUserFacingText,
  type Itinerary,
} from '@waypop/shared'

type Props = {
  itinerary: Itinerary
  cityLabel?: string | null
}

/** Stay / tips / FAQ / pace·idéal facts — mirrors Next Pop editorial blocks. */
export function ItineraryEditorialSections({ itinerary, cityLabel }: Props) {
  const stay = parseStay(itinerary.stay)
  const tips = parseTips(itinerary.tips)
  const faq = parseFaq(itinerary.faq)
  const pace = paceLabelFr(itinerary.pace)
  const ideal = idealLabelFr((itinerary.ideal_for || [])[0] || '')
  const budget =
    itinerary.budget_estimate_eur != null &&
    Number(itinerary.budget_estimate_eur) > 0
      ? `≈ ${Math.round(Number(itinerary.budget_estimate_eur))} € / jour`
      : null

  const facts = [
    pace ? { label: 'Rythme', value: pace } : null,
    budget ? { label: 'Budget', value: budget } : null,
    ideal ? { label: 'Idéal', value: ideal } : null,
  ].filter(Boolean) as { label: string; value: string }[]

  const hasAny = facts.length > 0 || stay || tips.length > 0 || faq.length > 0
  if (!hasAny) return null

  const stayTitle = cityLabel
    ? `Où dormir à ${cityLabel}`
    : 'Où dormir'

  return (
    <div className="space-y-7">
      {facts.length > 0 ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {facts.map((f) => (
            <div
              key={f.label}
              className="rounded-2xl bg-[#F7F4EF] px-3.5 py-3"
            >
              <dt className="text-[10px] font-bold uppercase tracking-wide text-[#A3988C]">
                {f.label}
              </dt>
              <dd className="mt-1 text-sm font-bold text-[#1A120E]">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {stay ? (
        <section className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#A3988C]">
            Hébergement
          </p>
          <h2 className="text-lg font-bold text-[#1A120E]">{stayTitle}</h2>
          <div className="border-l-2 border-[#FF6B35]/80 pl-4">
            {stay.area ? (
              <p className="text-base font-extrabold text-[#1A120E]">
                {stay.area}
              </p>
            ) : null}
            {stay.vibe ? (
              <p className="mt-1 text-sm font-semibold text-[#FF6B35]">
                {stay.vibe}
              </p>
            ) : null}
            {stay.note ? (
              <p className="mt-2 text-[15px] leading-relaxed text-[#6B5C50] whitespace-pre-line">
                {sanitizeUserFacingText(stay.note, { multiline: true })}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {tips.length > 0 ? (
        <section className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#A3988C]">
            Conseils
          </p>
          <h2 className="text-lg font-bold text-[#1A120E]">Bon à savoir</h2>
          <ul className="space-y-2.5">
            {tips.map((t, i) => (
              <li
                key={i}
                className="flex gap-3 text-[15px] leading-relaxed text-[#6B5C50]"
              >
                <span
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF6B35]"
                  aria-hidden
                />
                <span>{sanitizeUserFacingText(t)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {faq.length > 0 ? (
        <section className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#A3988C]">
            Questions
          </p>
          <h2 className="text-lg font-bold text-[#1A120E]">
            Questions fréquentes
          </h2>
          <div className="divide-y divide-[#EDE8E1] border-y border-[#EDE8E1]">
            {faq.map((item, i) => (
              <details key={i} className="group py-3.5">
                <summary className="cursor-pointer list-none font-bold text-[#1A120E] marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {sanitizeUserFacingText(item.q)}
                    <span
                      className="text-[#A3988C] transition-transform group-open:rotate-45"
                      aria-hidden
                    >
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-2.5 text-[15px] leading-relaxed text-[#6B5C50] whitespace-pre-line">
                  {sanitizeUserFacingText(item.a, { multiline: true })}
                </p>
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
