import type { Metadata } from 'next';

import { LegalPage, legalStyles as s } from '../legal-styles';

export const metadata: Metadata = { title: 'Política de privacidad' };

export default function PrivacidadPage() {
  return (
    <LegalPage title="Politica de privacidad de datos" updated="5 de agosto de 2026">
      <h2 style={s.h2}>Datos que tratamos</h2>
      <p style={s.p}>
        SIS4S usa datos de cuenta, contacto, vivienda, circuito, estado del servicio de agua, historial de pagos,
        folios y comprobantes para administrar cuotas del fraccionamiento Ciudad de los 4 Soles.
      </p>
      <h2 style={s.h2}>Finalidades</h2>
      <ul style={s.list}>
        <li>Registrar residentes, representantes, tesoreras y personal autorizado.</li>
        <li>Gestionar pagos, cortes, reconexiones, reportes financieros y recibos.</li>
        <li>Validar sesiones, prevenir abuso, auditar operaciones y atender solicitudes de soporte.</li>
      </ul>
      <h2 style={s.h2}>Pagos</h2>
      <p style={s.p}>
        Los pagos con tarjeta se procesan mediante Mercado Pago. SIS4S conserva referencias, montos, comisiones,
        folios y estado de pago; los datos completos de tarjeta son tratados por el procesador de pagos.
      </p>
      <h2 style={s.h2}>Conservacion y seguridad</h2>
      <p style={s.p}>
        Conservamos la informacion necesaria para comprobacion administrativa y cumplimiento legal. Aplicamos
        controles de acceso por rol, sesiones seguras, cifrado de tokens sensibles y limitacion de intentos en
        endpoints criticos.
      </p>
      <h2 style={s.h2}>Notificaciones push</h2>
      <p style={s.p}>
        Si activas los avisos, guardamos la suscripción técnica de ese navegador o dispositivo para enviarte
        confirmaciones de pago y avisos del servicio. Puedes desactivarla desde el panel de residente.
      </p>
      <h2 style={s.h2}>Derechos</h2>
      <p style={s.p}>
        Puedes solicitar acceso, rectificacion o baja de datos contactando a la administracion del sistema o al
        representante de tu circuito. Algunas operaciones pueden requerir conservar registros contables.
      </p>
    </LegalPage>
  );
}
