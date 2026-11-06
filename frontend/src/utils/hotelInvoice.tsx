import type { ReactNode } from 'react'

/**
 * Open LiteAPI guest invoice with instant loading feedback.
 * Opens a tab immediately (avoids popup blockers after await), then swaps to the PDF.
 */
export async function openHotelInvoicePdf(opts: {
  fetchBlob: () => Promise<Blob>
  filename: string
}): Promise<'opened' | 'downloaded'> {
  const filename = opts.filename.replace(/[^\w.\-]+/g, '_') || 'facture-hotel.pdf'
  const loadingHtml = `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Facture…</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:ui-sans-serif,system-ui,sans-serif;background:#FFF9F5;color:#334155;text-align:center}
  .box{padding:24px}
  .spin{width:28px;height:28px;margin:0 auto 14px;border:3px solid #A7F3D0;border-top-color:#059669;
    border-radius:50%;animation:s .7s linear infinite}
  @keyframes s{to{transform:rotate(360deg)}}
  p{margin:0;font-size:15px;font-weight:600}
  .sub{margin-top:6px;font-size:13px;font-weight:500;color:#64748b}
</style></head>
<body><div class="box">
  <div class="spin" aria-hidden="true"></div>
  <p>Préparation de ta facture…</p>
  <p class="sub">Quelques secondes</p>
</div></body></html>`

  const tab = window.open('about:blank', '_blank')
  if (tab) {
    try {
      tab.document.write(loadingHtml)
      tab.document.close()
    } catch {
      /* cross-origin / restricted — still try location later */
    }
  }

  try {
    const blob = await opts.fetchBlob()
    const pdf =
      blob.type && blob.type.includes('pdf')
        ? blob
        : new Blob([blob], { type: 'application/pdf' })
    const url = URL.createObjectURL(pdf)

    if (tab && !tab.closed) {
      try {
        tab.location.replace(url)
      } catch {
        tab.location.href = url
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
      return 'opened'
    }

    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return 'downloaded'
  } catch (e) {
    if (tab && !tab.closed) {
      try {
        tab.document.open()
        tab.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>Facture</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
font-family:ui-sans-serif,system-ui,sans-serif;background:#FFF9F5;color:#9F1239;padding:24px;text-align:center}
p{font-weight:700}</style></head>
<body><p>Impossible de charger la facture.<br/><span style="color:#64748b;font-weight:500;font-size:14px">Ferme cet onglet et réessaie.</span></p></body></html>`)
        tab.document.close()
      } catch {
        try {
          tab.close()
        } catch {
          /* ignore */
        }
      }
    }
    throw e
  }
}

/** Inline spinner for invoice CTAs */
export function InvoiceBusyLabel({
  label = 'Préparation…',
}: {
  label?: string
}): ReactNode {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80"
        aria-hidden
      />
      {label}
    </span>
  )
}
