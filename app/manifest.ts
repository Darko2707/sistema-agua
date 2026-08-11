import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/residente',
    name: 'SIS4S - Sistema de Agua',
    short_name: 'SIS4S Agua',
    description: 'Consulta pagos, recibos y el estado de tu servicio de agua.',
    start_url: '/residente',
    scope: '/',
    display: 'standalone',
    background_color: '#F4EEE0',
    theme_color: '#15493A',
    lang: 'es-MX',
    categories: ['utilities', 'finance'],
    icons: [
      {
        src: '/logo1SIS4S.png',
        sizes: '1000x1000',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/logo2SIS4S.png',
        sizes: '1600x1600',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
