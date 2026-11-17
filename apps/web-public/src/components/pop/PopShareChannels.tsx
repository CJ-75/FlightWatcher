'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { isPublicImageSrc, PopImage } from '@/components/pop/PopImage'

type ChannelId =
  | 'instagram'
  | 'tiktok'
  | 'whatsapp'
  | 'snapchat'
  | 'messenger'
  | 'telegram'

type Channel = {
  id: ChannelId
  label: string
  bg: string
  ink?: boolean
  href?: string | null
  copyThenOpen?: string | null
}

/** Official Simple Icons paths (CC0) — brand marks only. */
const BRAND_PATH: Record<ChannelId, string> = {
  whatsapp:
    'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z',
  instagram:
    'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077',
  tiktok:
    'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
  snapchat:
    'M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015h-.149c-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.107-.779-1.707-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.15-.055-.225-.015-.243.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.884-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.465-.105l-.046-.569c-.098-1.626-.225-3.651.307-4.837C7.392 1.077 10.739.807 11.727.807l.419-.015h.06z',
  messenger:
    'M.001 11.639C.001 4.949 5.241 0 12.001 0S24 4.95 24 11.639c0 6.689-5.24 11.638-12 11.638-1.21 0-2.38-.16-3.47-.46a.96.96 0 00-.64.05l-2.39 1.05a.96.96 0 01-1.35-.85l-.07-2.14a.97.97 0 00-.32-.68A11.39 11.389 0 01.002 11.64zm8.32-2.19l-3.52 5.6c-.35.53.32 1.139.82.75l3.79-2.87c.26-.2.6-.2.87 0l2.8 2.1c.84.63 2.04.4 2.6-.48l3.52-5.6c.35-.53-.32-1.13-.82-.75l-3.79 2.87c-.25.2-.6.2-.86 0l-2.8-2.1a1.8 1.8 0 00-2.61.48z',
  telegram:
    'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
}

function isMobileUa(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

function buildChannels(title: string, url: string): Channel[] {
  const text = `${title}\n${url}`.trim()
  const mobile = isMobileUa()
  return [
    {
      id: 'instagram',
      label: 'Instagram',
      bg: 'bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]',
      copyThenOpen: mobile ? 'instagram://' : 'https://www.instagram.com/',
    },
    {
      id: 'tiktok',
      label: 'TikTok',
      bg: 'bg-ink',
      copyThenOpen: mobile ? 'tiktok://' : 'https://www.tiktok.com/',
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      bg: 'bg-[#25D366]',
      href: `https://wa.me/?text=${encodeURIComponent(text)}`,
    },
    {
      id: 'snapchat',
      label: 'Snapchat',
      bg: 'bg-[#FFFC00]',
      ink: true,
      copyThenOpen: mobile
        ? `snapchat://share?link=${encodeURIComponent(url)}`
        : 'https://www.snapchat.com/',
    },
    {
      id: 'messenger',
      label: 'Messenger',
      bg: 'bg-[#006AFF]',
      href: mobile
        ? `fb-messenger://share/?link=${encodeURIComponent(url)}`
        : null,
      copyThenOpen: mobile
        ? null
        : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
    {
      id: 'telegram',
      label: 'Telegram',
      bg: 'bg-[#229ED9]',
      href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    },
  ]
}

function hostLabel(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return 'waypop.co'
  }
}

export function PopShareChannels({
  title,
  url,
  subtitle,
  image,
  className = '',
}: {
  title: string
  url: string
  subtitle?: string | null
  image?: string | null
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const titleId = useId()

  const flash = useCallback((msg: string) => {
    setHint(msg)
    window.setTimeout(() => setHint(null), 2200)
  }, [])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      flash('Lien copié')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      flash('Impossible de copier le lien')
    }
  }, [flash, url])

  const onChannel = useCallback(
    async (ch: Channel) => {
      if (!url) {
        flash('Lien indisponible')
        return
      }
      if (ch.href) {
        window.open(ch.href, '_blank', 'noopener,noreferrer')
        return
      }
      try {
        await navigator.clipboard.writeText(url)
        flash(`Lien copié — colle dans ${ch.label}`)
      } catch {
        flash('Impossible de copier le lien')
        return
      }
      if (ch.copyThenOpen) {
        window.setTimeout(() => {
          window.open(ch.copyThenOpen!, '_blank', 'noopener,noreferrer')
        }, 120)
      }
    },
    [flash, url],
  )

  const channels = buildChannels(title, url)
  const showImage = isPublicImageSrc(image)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group mt-4 flex w-full items-center gap-3.5 rounded-xl border border-ink/10 bg-white px-3.5 py-3.5 text-left shadow-[0_1px_0_rgba(26,18,14,0.04)] transition hover:border-ink/20 hover:bg-[#FCFAF8] active:scale-[0.99] ${className}`}
      >
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink text-cream transition group-hover:bg-ink/90">
          <ShareGlyph />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-extrabold leading-tight text-ink">
            Partager ce Pop
          </span>
          <span className="mt-0.5 block text-[12px] leading-snug text-ink-muted">
            Solo, à deux ou à plusieurs
          </span>
        </span>
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sand text-ink transition group-hover:bg-ink group-hover:text-cream"
          aria-hidden
        >
          <ChevronIcon />
        </span>
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[11000] flex items-end justify-center bg-[rgba(18,16,14,0.55)] p-4 sm:items-center"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              onClick={() => setOpen(false)}
            >
              <div
                className="w-full max-w-md overflow-hidden rounded-2xl bg-cream shadow-2xl ring-1 ring-line"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
                  <h2
                    id={titleId}
                    className="text-base font-extrabold tracking-tight text-ink"
                  >
                    Partager ce Pop
                  </h2>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-sand/80 text-ink transition hover:bg-sand"
                    aria-label="Fermer"
                  >
                    <CloseIcon />
                  </button>
                </div>

                <div className="space-y-4 p-4">
                  <div className="overflow-hidden rounded-xl bg-white ring-1 ring-line">
                    {showImage ? (
                      <div className="relative aspect-[1.9/1] bg-sand">
                        <PopImage
                          src={image!}
                          alt=""
                          variant="card"
                          fill
                          className="object-cover"
                          sizes="(max-width: 480px) 100vw, 28rem"
                        />
                      </div>
                    ) : null}
                    <div className="space-y-1 px-3.5 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                        {hostLabel(url)}
                      </p>
                      <p className="text-[15px] font-extrabold leading-snug text-ink">
                        {title}
                      </p>
                      {subtitle ? (
                        <p className="line-clamp-2 text-[13px] leading-snug text-ink-muted">
                          {subtitle}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-stretch gap-2">
                    <p className="min-w-0 flex-1 truncate rounded-xl bg-sand/70 px-3 py-2.5 text-[12px] font-semibold text-ink ring-1 ring-line">
                      {url}
                    </p>
                    <button
                      type="button"
                      onClick={() => void copyLink()}
                      className="shrink-0 rounded-xl bg-ink px-3.5 text-[12px] font-bold text-cream transition hover:bg-ink/90"
                    >
                      {copied ? 'Copié' : 'Copier'}
                    </button>
                  </div>

                  <div>
                    <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                      Envoyer via
                    </p>
                    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {channels.map((ch) => (
                        <li key={ch.id}>
                          <button
                            type="button"
                            onClick={() => void onChannel(ch)}
                            className="flex w-full flex-col items-center gap-1.5 rounded-xl px-1 py-2 transition hover:bg-sand/60"
                          >
                            <span
                              className={`inline-flex h-11 w-11 items-center justify-center rounded-[13px] shadow-sm ${ch.bg} ${
                                ch.ink ? 'text-ink' : 'text-white'
                              }`}
                            >
                              <BrandIcon id={ch.id} />
                            </span>
                            <span className="text-[10px] font-bold text-ink">
                              {ch.label}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {hint ? (
                    <p
                      className="text-center text-[12px] font-semibold text-ink"
                      role="status"
                    >
                      {hint}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function BrandIcon({ id }: { id: ChannelId }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={BRAND_PATH[id]} />
    </svg>
  )
}

function ShareGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8 7l4-4 4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 5l7 7-7 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
