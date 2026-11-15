import type { Metadata } from 'next'
import { Sora } from 'next/font/google'
import './globals.css'

const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  display: 'swap',
  variable: '--font-sora',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://waypop.co'),
  title: {
    default: 'Waypop — week-ends pas chers, déjà organisés',
    template: '%s | Waypop',
  },
  robots: { index: false, follow: true },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" className={sora.variable}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  )
}
