import type { ItineraryMarkerTile } from '@flightwatcher/shared'

type Props = {
  tiles: ItineraryMarkerTile[]
}

/** Repères — même esprit que PathStepsTiles. */
export function ItineraryMarkerTiles({ tiles }: Props) {
  if (!tiles.length) return null
  return (
    <div
      className={`grid max-w-xl gap-2 ${
        tiles.length >= 4
          ? 'grid-cols-4'
          : tiles.length === 3
            ? 'grid-cols-3'
            : 'grid-cols-2'
      }`}
    >
      {tiles.map((t) => (
        <div
          key={t.id}
          className="flex flex-col items-center gap-1.5 rounded-2xl bg-[#F7F4EF] px-1 py-3 text-center"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#A3988C]">
            {t.label}
          </span>
          <span className="px-1 text-xs font-bold leading-tight text-[#1A120E]">
            {t.detail}
          </span>
        </div>
      ))}
    </div>
  )
}
