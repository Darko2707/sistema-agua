import type { Metadata } from 'next'
import { Geist, Geist_Mono, Mulish, Bricolage_Grotesque, Manrope, Space_Grotesk } from 'next/font/google'
import { Providers } from '@/components/providers'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const mulish = Mulish({
  variable: '--font-mulish',
  subsets: ['latin'],
})

const bricolage = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin'],
})

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
})

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Sistema de Agua',
  description: 'Sistema de gestión de pagos de agua',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${mulish.variable} ${bricolage.variable} ${manrope.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-slate-50 font-sans antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          Saltar al contenido principal
        </a>
        <Providers>
          <main id="main-content" className="min-h-screen">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}