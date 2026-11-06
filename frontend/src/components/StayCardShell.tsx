import type { ReactNode } from 'react'

/** Shared shell from Mes réservations — thumb + status chip + body. */
export function StayCardShell({
  photo,
  chipClass,
  chipLabel,
  children,
  as = 'div',
}: {
  photo: string | null
  chipClass: string
  chipLabel: string
  children: ReactNode
  as?: 'div' | 'li' | 'section'
}) {
  const Tag = as
  return (
    <Tag className="bg-white rounded-3xl border border-line shadow-soft overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-stretch min-h-[11rem]">
        <div className="relative h-40 sm:h-auto sm:min-h-[11rem] bg-slate-100 overflow-hidden">
          {photo ? (
            <img
              src={photo}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary-100 to-slate-200" />
          )}
          <span
            className={`absolute top-3 left-3 rounded-full text-[11px] font-bold px-2.5 py-1 ${chipClass}`}
          >
            {chipLabel}
          </span>
        </div>
        <div className="p-5 sm:p-6 flex flex-col min-w-0 min-h-[11rem]">
          {children}
        </div>
      </div>
    </Tag>
  )
}
