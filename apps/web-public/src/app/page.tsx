import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

/** Landing V2 shell — Lot 4 bis fills real content. */
export default function LandingPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16 space-y-8">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary-700">
        Waypop
      </p>
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
        Les week-ends entre potes, déjà organisés, pas chers
      </h1>
      <p className="text-muted text-base leading-relaxed">
        Landing V2 (shell Lot 1). Contenu réel et îlot prix au Lot 4 bis.
      </p>
      <Card className="p-6 space-y-4">
        <p className="text-sm font-bold text-ink">Je pars de…</p>
        <Button variant="primary">Voir les Pops</Button>
      </Card>
    </main>
  )
}
