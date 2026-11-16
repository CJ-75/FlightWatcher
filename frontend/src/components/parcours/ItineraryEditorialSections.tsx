import {
  buildItineraryPopFacts,
  idealLabelFr,
  parseFaq,
  parseStay,
  parseTips,
  sanitizeUserFacingText,
  type Itinerary,
  type ItineraryPopFact,
} from '@waypop/shared'

type Props = {
  itinerary: Itinerary
  cityLabel?: string | null
  /** facts = Next-like row; blocks = stay/tips/faq; all = both (legacy). */
  sections?: 'facts' | 'blocks' | 'all'
}

function FactsRow({ facts }: { facts: ItineraryPopFact[] }) {
  if (!facts.length) return null
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {facts.map((f) => (
        <div key={f.label} className="rounded-2xl bg-[#F7F4EF] px-3.5 py-3">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-[#A3988C]">
            {f.label}
          </dt>
          <dd className="mt-1 text-sm font-bold text-[#1A120E]">{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Stay / tips / FAQ / facts — mirrors Next Pop editorial order when split. */
export function ItineraryEditorialSections({
  itinerary,
  cityLabel,
  sections = 'all',
}: Props) {
  const showFacts = sections === 'facts' || sections === 'all'
  const showBlocks = sections === 'blocks' || sections === 'all'

  const facts = showFacts ? buildItineraryPopFacts(itinerary) : []
  const stay = showBlocks ? parseStay(itinerary.stay) : null
  const tips = showBlocks ? parseTips(itinerary.tips) : []
  const faq = showBlocks ? parseFaq(itinerary.faq) : []

  const hasAny =
    facts.length > 0 || stay || tips.length > 0 || faq.length > 0
  if (!hasAny) return null

  const idealOne = idealLabelFr(
    (itinerary.ideal_for || [])[0] || (itinerary.occasions || [])[0],
  )
  const stayTitle = cityLabel
    ? idealOne
      ? `Où dormir à ${cityLabel} pour une ${idealOne.toLowerCase()}`
      : `Où dormir à ${cityLabel}`
    : 'Où dormir'
  const faqTitle = cityLabel
    ? `Questions fréquentes sur un week-end à ${cityLabel}`
    : 'Questions fréquentes'

  return (
    <div className="space-y-7">
      {showFacts ? <FactsRow facts={facts} /> : null}

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
          <h2 className="text-lg font-bold text-[#1A120E]">{faqTitle}</h2>
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
