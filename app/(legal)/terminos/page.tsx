import { LegalPage, legalStyles as s } from '../legal-styles';

export default function TerminosPage() {
  return (
    <LegalPage title="Terminos y condiciones" updated="5 de agosto de 2026">
      <h2 style={s.h2}>Servicio</h2>
      <p style={s.p}>
        SIS4S es una herramienta administrativa para registrar cuotas de agua, pagos, folios, reportes, cortes y
        reconexiones de residentes autorizados del fraccionamiento.
      </p>
      <h2 style={s.h2}>Responsabilidades del usuario</h2>
      <ul style={s.list}>
        <li>Proporcionar informacion correcta de cuenta, contacto y vivienda.</li>
        <li>No compartir credenciales ni intentar acceder a informacion de otros circuitos.</li>
        <li>Verificar importes, periodos y metodo de pago antes de confirmar una operacion.</li>
      </ul>
      <h2 style={s.h2}>Pagos</h2>
      <p style={s.p}>
        Los residentes pueden pagar el mes vigente o meses adelantados con tarjeta mediante Mercado Pago. Las tesoreras
        pueden registrar pagos recibidos en efectivo o transferencia para su circuito. Cada pago confirmado genera un
        folio y queda sujeto a validacion administrativa.
      </p>
      <h2 style={s.h2}>Disponibilidad y seguridad</h2>
      <p style={s.p}>
        El sistema puede aplicar limites de solicitudes, suspender acciones sospechosas y registrar eventos tecnicos
        para proteger la operacion. El servicio puede depender de proveedores externos de autenticacion, base de datos,
        almacenamiento y pagos.
      </p>
    </LegalPage>
  );
}
