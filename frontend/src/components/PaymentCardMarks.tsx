/** Card network marks under payment CTAs (booking-style trust). */

type Props = {
  /** Light marks on dark/primary buttons */
  onDark?: boolean
  className?: string
  /** Hide the “Paiement sécurisé” line */
  compact?: boolean
}

function VisaMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 32" aria-hidden>
      <rect width="48" height="32" rx="4" fill="#1A1F71" />
      <text
        x="24"
        y="21"
        textAnchor="middle"
        fill="#fff"
        fontSize="11"
        fontWeight="800"
        fontFamily="Arial, sans-serif"
        letterSpacing="0.5"
      >
        VISA
      </text>
    </svg>
  )
}

function MastercardMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 32" aria-hidden>
      <rect width="48" height="32" rx="4" fill="#252525" />
      <circle cx="19" cy="16" r="8" fill="#EB001B" />
      <circle cx="29" cy="16" r="8" fill="#F79E1B" />
      <path
        d="M24 10.2a8 8 0 0 1 0 11.6 8 8 0 0 1 0-11.6z"
        fill="#FF5F00"
      />
    </svg>
  )
}

function AmexMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 32" aria-hidden>
      <rect width="48" height="32" rx="4" fill="#2E77BC" />
      <text
        x="24"
        y="20"
        textAnchor="middle"
        fill="#fff"
        fontSize="8"
        fontWeight="800"
        fontFamily="Arial, sans-serif"
      >
        AMEX
      </text>
    </svg>
  )
}

function CbMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 32" aria-hidden>
      <rect width="48" height="32" rx="4" fill="#fff" stroke="#E2E8F0" />
      <text
        x="24"
        y="14"
        textAnchor="middle"
        fill="#1e3a8a"
        fontSize="9"
        fontWeight="900"
        fontFamily="Arial, sans-serif"
      >
        CB
      </text>
      <text
        x="24"
        y="24"
        textAnchor="middle"
        fill="#64748b"
        fontSize="6"
        fontWeight="700"
        fontFamily="Arial, sans-serif"
      >
        carte
      </text>
    </svg>
  )
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

export function PaymentCardMarks({
  onDark = false,
  className = '',
  compact = false,
}: Props) {
  const mark = 'h-5 w-[30px] sm:h-6 sm:w-9 rounded-[3px] shadow-sm'
  return (
    <div
      className={`flex flex-col items-center gap-1.5 ${className}`}
      aria-label="Cartes acceptées : Visa, Mastercard, American Express, CB"
    >
      {!compact ? (
        <p
          className={`inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold ${
            onDark ? 'text-white/85' : 'text-slate-500'
          }`}
        >
          <LockIcon className="w-3 h-3 shrink-0" />
          Paiement sécurisé
        </p>
      ) : null}
      <div className="flex items-center justify-center gap-1.5">
        <VisaMark className={mark} />
        <MastercardMark className={mark} />
        <AmexMark className={mark} />
        <CbMark className={mark} />
      </div>
    </div>
  )
}
