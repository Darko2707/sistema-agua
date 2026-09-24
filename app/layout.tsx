import type { Metadata, Viewport } from 'next'
import { Providers } from '@/components/providers'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'SISCO - Sistema Integral de Servicios para la Comunidad',
    template: '%s | SISCO',
  },
  description: 'Consulta pagos, recibos y el estado de tu servicio de agua.',
  applicationName: 'SISCO',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SISCO',
  },
  icons: {
    apple: '/logo1SIS4S.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#15493A',
  colorScheme: 'light',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="es"
      className="font-sans"
    >
      <body className="min-h-screen bg-slate-50 font-sans antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          Saltar al contenido principal
        </a>
        <Providers>
          <main id="main-content" className="flex min-h-screen flex-col">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
