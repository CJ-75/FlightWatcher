import type { Metadata, Viewport } from 'next'
import { Sora } from 'next/font/google'
import { PreviewBadge } from '@/components/PreviewBadge'
import './globals.css'

/** 400 + 700 cover body/UI; 800 for display — skip 600 to cut font bytes */
const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '700', '800'],
  display: 'swap',
  variable: '--font-sora',
  preload: true,
})

export const metadata: Metadata = {
  metadataBase: new URL('https://waypop.co'),
  title: {
    default: 'Waypop — week-ends pas chers, déjà organisés',
    template: '%s | Waypop',
  },
  robots: { index: false, follow: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FFF9F5',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" className={sora.variable}>
      <body className="min-h-screen font-sans">
        {children}
        <PreviewBadge />
      </body>
    </html>
  )
}
