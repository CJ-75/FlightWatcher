type Props = {
  href: string
  className?: string
  size?: 'md' | 'sm'
  /** soft = outline secondaire (body) ; hero = verre sur photo */
  variant?: 'soft' | 'hero'
}

export function LaunchPopCta({
  href,
  className = '',
  size = 'md',
  variant = 'soft',
}: Props) {
  const pad =
    size === 'sm' ? 'px-4 py-2.5 text-sm' : 'px-5 py-3 text-sm sm:px-6 sm:py-3.5'

  const tone =
    variant === 'hero'
      ? 'border border-white/25 bg-white/10 text-white backdrop-blur-sm hover:bg-white/15'
      : 'border border-ink/20 bg-transparent text-ink hover:border-ink/40 hover:bg-ink/[0.04]'

  return (
    <a
      href={href}
      className={`inline-flex items-center gap-2 rounded-2xl font-bold no-underline transition-colors ${tone} ${pad} ${className}`}
    >
      <PlayIcon />
      Lancer le Pop
    </a>
  )
}

function PlayIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z" />
    </svg>
  )
}
