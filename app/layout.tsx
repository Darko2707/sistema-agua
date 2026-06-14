import type { Metadata } from 'next'
import {
  Geist,
  Geist_Mono,
} from 'next/font/google'

import './globals.css'

const geistSans = Geist({
  variable:
    '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable:
    '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata =
  {
    title:
      'Sistema de Agua',
    description:
      'Sistema de gestión de pagos de agua',
  }

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-slate-50 font-sans antialiased">
        <main className="min-h-screen">
          {children}
        </main>
      </body>
    </html>
  )
}