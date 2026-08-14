import type { Metadata } from 'next';

import { LegalPage, legalStyles as s } from '../legal-styles';

export const metadata: Metadata = { title: 'Política de cookies' };

export default function CookiesPage() {
  return (
    <LegalPage title="Politica de cookies" updated="14 de agosto de 2026">
      <h2 style={s.h2}>Uso de cookies</h2>
      <p style={s.p}>
        SIS4S utiliza cookies y tecnologias similares necesarias para iniciar sesion, mantener tu cuenta segura,
        recordar el estado de autenticacion y operar el panel correspondiente a tu rol.
      </p>
      <h2 style={s.h2}>Cookies necesarias</h2>
      <p style={s.p}>
        Las cookies de sesion son indispensables para identificar usuarios autenticados y proteger rutas privadas.
        Desactivarlas puede impedir el acceso al sistema.
      </p>
      <h2 style={s.h2}>Recordar usuario</h2>
      <p style={s.p}>
        Si activas &quot;Recordar usuario&quot; al iniciar sesion, SIS4S guarda unicamente tu correo electronico en el
        almacenamiento local de ese navegador. La contraseña nunca se almacena. Puedes eliminar el correo guardado
        desmarcando la opcion o borrando los datos del sitio desde el navegador.
      </p>
      <h2 style={s.h2}>Servicios externos</h2>
      <p style={s.p}>
        Al pagar con Mercado Pago, esa plataforma puede usar sus propias cookies conforme a sus politicas. SIS4S no
        controla cookies establecidas directamente por el procesador de pagos.
      </p>
      <h2 style={s.h2}>Gestion</h2>
      <p style={s.p}>
        Puedes borrar o bloquear cookies desde tu navegador. Si lo haces, es posible que debas iniciar sesion de nuevo
        o que algunas funciones de pago y reportes no operen correctamente.
      </p>
    </LegalPage>
  );
}
