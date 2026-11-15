import Image from 'next/image'

type Tone = 'peach' | 'sand' | 'sky' | 'night' | 'coral' | 'mist'

const OVERLAY: Record<Tone, string> = {
  peach: 'bg-gradient-to-br from-peach-mist/95 via-canvas/90 to-brand-50/85',
  sand: 'bg-gradient-to-b from-sand/92 via-sand/88 to-peach-mist/90',
  sky: 'bg-gradient-to-br from-sky-soft/95 via-white/85 to-peach-mist/80',
  night: 'bg-gradient-to-b from-night/88 via-night/82 to-night/92',
  coral: 'bg-gradient-to-br from-brand-500/92 via-brand-600/90 to-brand-700/95',
  mist: 'bg-gradient-to-t from-white/95 via-peach-mist/88 to-white/92',
}

/** Photo + color wash behind a section — keeps content readable. */
export function SectionBg({
  src,
  tone = 'mist',
  opacity = 40,
}: {
  src: string
  tone?: Tone
  opacity?: number
}) {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <Image
          src={src}
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          style={{ opacity: opacity / 100 }}
        />
      </div>
      <div className={`pointer-events-none absolute inset-0 ${OVERLAY[tone]}`} aria-hidden />
    </>
  )
}
