'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authClient } from '@/lib/auth-client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';
import { useCircuitos } from '@/hooks/useCircuito';
import { AuthCard, C, inputBase, selectBase, labelBase, buttonGold, linkButton, FM } from '../auth-styles';

const cuentaSchema = z.object({
  nombre: z.string().min(2, 'Ingresa tu nombre completo'),
  email: z.string().email('Correo electrónico inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  aceptaLegales: z.literal(true, { error: 'Debes aceptar los terminos y condiciones para continuar' }),
});
type CuentaForm = z.infer<typeof cuentaSchema>;

const perfilSchema = z.object({
  telefono: z.string().min(10, 'Mínimo 10 dígitos').regex(/^\d+$/, 'Solo números'),
  sexo: z.enum(['masculino', 'femenino', 'otro']),
  tenencia: z.enum(['propietario', 'inquilino']),
  circuitoId: z.string().min(1, 'Selecciona tu circuito'),
  edificio: z.string().min(1, 'Ingresa el número de edificio'),
  deptoNumero: z.string().min(1, 'Ingresa el número de departamento').regex(/^\d+$/, 'Solo dígitos'),
  deptoLetra: z.string().regex(/^[a-zA-Z]?$/, 'Solo una letra (opcional)').optional(),
  nombrePropietario: z.string().optional(),
  telefonoPropietario: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.tenencia === 'inquilino') {
    if (!data.nombrePropietario || data.nombrePropietario.trim().length < 2) {
      ctx.addIssue({ code: 'custom', message: 'Ingresa el nombre del propietario', path: ['nombrePropietario'] });
    }
    if (!data.telefonoPropietario || data.telefonoPropietario.trim().length < 10) {
      ctx.addIssue({ code: 'custom', message: 'Teléfono del propietario (mínimo 10 dígitos)', path: ['telefonoPropietario'] });
    }
  }
});
type PerfilForm = z.infer<typeof perfilSchema>;

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" aria-live="polite" style={{ margin: '4px 0 0', fontSize: 12, color: C.danger, fontFamily: FM }}>
      {message}
    </p>
  );
}

export default function RegistroPage() {
  const router = useRouter();
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [serverError, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [codigoWhatsApp, setCodigoWhatsApp] = useState('');
  const [devCode, setDevCode] = useState('');

  const circuitosQuery = useCircuitos();
  const circuitos = circuitosQuery.data ?? [];

  const cuenta = useForm<CuentaForm>({ resolver: zodResolver(cuentaSchema), mode: 'onTouched' });
  const perfil = useForm<PerfilForm>({
    resolver: zodResolver(perfilSchema),
    mode: 'onTouched',
    defaultValues: { sexo: 'masculino', tenencia: 'propietario', deptoLetra: '' },
  });

  const tenencia = perfil.watch('tenencia');
  const esInquilino = tenencia === 'inquilino';
  const deptoNumero = perfil.watch('deptoNumero') ?? '';
  const deptoLetra = perfil.watch('deptoLetra') ?? '';

  async function handleCrearCuenta(data: CuentaForm) {
    setError('');
    void data;
    setPaso(2);
  }

  async function handleCompletarPerfil(data: PerfilForm) {
    setError('');
    setSubmitting(true);
    const cuentaData = cuenta.getValues();
    const departamento = `${data.deptoNumero.trim()}${(data.deptoLetra ?? '').trim()}`;
    try {
      const { error: signUpError } = await authClient.signUp.email({
        email: cuentaData.email,
        password: cuentaData.password,
        name: cuentaData.nombre,
      });
      if (signUpError) {
        setPaso(1);
        throw new Error(signUpError.message ?? 'No se pudo crear la cuenta. El correo podría estar registrado.');
      }
      const { error: signInError } = await authClient.signIn.email({
        email: cuentaData.email,
        password: cuentaData.password,
      });
      if (signInError) throw new Error('Cuenta creada, pero no se pudo iniciar sesión automáticamente.');
      await trpc.operacion.aceptarLegales.mutate({
        privacidadVersion: '2026-08-05',
        cookiesVersion: '2026-08-05',
        terminosVersion: '2026-08-05',
      });
      await trpc.usuarios.crearPerfil.mutate({
        telefono: data.telefono,
        sexo: data.sexo,
        tenencia: data.tenencia,
        circuitoId: data.circuitoId,
        edificio: data.edificio,
        departamento,
        ...(esInquilino && {
          nombrePropietario: data.nombrePropietario?.trim(),
          telefonoPropietario: data.telefonoPropietario?.trim(),
        }),
      });
      await enviarCodigoWhatsApp(data.telefono);
      setPaso(3);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSubmitting(false);
    }
  }

  async function enviarCodigoWhatsApp(telefono: string) {
    const res = await fetch('/api/auth/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefono }),
    });
    const json = await res.json().catch(() => ({})) as { error?: string; devCode?: string };
    if (!res.ok) throw new Error(json.error ?? 'No se pudo enviar el codigo por WhatsApp');
    setDevCode(json.devCode ?? '');
  }

  async function handleVerificarWhatsApp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const data = perfil.getValues();
    try {
      const res = await fetch('/api/auth/whatsapp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefono: data.telefono, code: codigoWhatsApp }),
      });
      const json = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Codigo incorrecto');

      router.push('/residente');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReenviarCodigo() {
    setError('');
    setSubmitting(true);
    try {
      await enviarCodigoWhatsApp(perfil.getValues().telefono);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo reenviar el codigo');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title={paso === 1 ? 'Crear cuenta' : paso === 2 ? 'Completa tu perfil' : 'Verifica tu WhatsApp'}
      subtitle={`Paso ${paso} de 3`}
      maxWidth={paso === 1 || paso === 3 ? 420 : 620}
      footer={(
        <>
          ¿Ya tienes cuenta?{' '}
          <button type="button" className="auth-link" style={linkButton} onClick={() => router.push('/login')}>
            Inicia sesión
          </button>
        </>
      )}
    >
      <div style={{ height: 5, background: '#EFE6D2', borderRadius: 999, overflow: 'hidden', margin: '0 0 20px' }}>
        <div style={{ height: '100%', width: paso === 1 ? '33.33%' : paso === 2 ? '66.66%' : '100%', background: C.greenDk, borderRadius: 999, transition: 'width .35s ease' }} />
      </div>

      {paso === 1 ? (
        <form onSubmit={cuenta.handleSubmit(handleCrearCuenta)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate aria-label="Formulario de creación de cuenta">
          <div>
            <label htmlFor="nombre" style={labelBase}>Nombre completo</label>
            <input id="nombre" type="text" className="auth-inp" placeholder="Juan Pérez" autoComplete="name" aria-required="true" aria-describedby={cuenta.formState.errors.nombre ? 'nombre-err' : undefined} aria-invalid={!!cuenta.formState.errors.nombre} style={inputBase} {...cuenta.register('nombre')} />
            <FieldError id="nombre-err" message={cuenta.formState.errors.nombre?.message} />
          </div>
          <div>
            <label htmlFor="reg-email" style={labelBase}>Correo electrónico</label>
            <input id="reg-email" type="email" className="auth-inp" placeholder="tu@correo.com" autoComplete="email" aria-required="true" aria-describedby={cuenta.formState.errors.email ? 'email-err' : undefined} aria-invalid={!!cuenta.formState.errors.email} style={inputBase} {...cuenta.register('email')} />
            <FieldError id="email-err" message={cuenta.formState.errors.email?.message} />
          </div>
          <div>
            <label htmlFor="reg-password" style={labelBase}>Contraseña</label>
            <input id="reg-password" type="password" className="auth-inp" placeholder="mínimo 8 caracteres" autoComplete="new-password" aria-required="true" aria-describedby={cuenta.formState.errors.password ? 'pwd-err' : 'pwd-hint'} aria-invalid={!!cuenta.formState.errors.password} style={inputBase} {...cuenta.register('password')} />
            <p id="pwd-hint" style={{ fontSize: 12, color: C.textWarm, marginTop: 4 }}>Mínimo 8 caracteres.</p>
            <FieldError id="pwd-err" message={cuenta.formState.errors.password?.message} />
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5, color: C.textWarm, lineHeight: 1.45, fontWeight: 700 }}>
            <input
              id="acepta-legales"
              type="checkbox"
              aria-required="true"
              aria-invalid={!!cuenta.formState.errors.aceptaLegales}
              aria-describedby={cuenta.formState.errors.aceptaLegales ? 'legales-err' : undefined}
              style={{ marginTop: 2, accentColor: C.greenDk }}
              {...cuenta.register('aceptaLegales')}
            />
            <span>
              Acepto los <Link className="auth-link" style={{ ...linkButton, fontSize: 12.5 }} href="/terminos">terminos y condiciones</Link>, la <Link className="auth-link" style={{ ...linkButton, fontSize: 12.5 }} href="/privacidad">privacidad</Link> y el uso de <Link className="auth-link" style={{ ...linkButton, fontSize: 12.5 }} href="/cookies">cookies</Link>.
            </span>
          </label>
          <FieldError id="legales-err" message={cuenta.formState.errors.aceptaLegales?.message} />
          {serverError && <div role="alert" aria-live="assertive" style={{ background: C.dangerBg, border: '1px solid #F3BFBF', borderRadius: 14, padding: '10px 14px', fontSize: 13, color: C.danger, fontWeight: 700 }}>{serverError}</div>}
          <button className="auth-primary" type="submit" style={{ ...buttonGold, marginTop: 2 }}>Continuar</button>
        </form>
      ) : paso === 2 ? (
        <form onSubmit={perfil.handleSubmit(handleCompletarPerfil)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate aria-label="Formulario de perfil de residente">
          <div className="auth-grid-2">
            <div>
              <label htmlFor="telefono" style={labelBase}>Teléfono</label>
              <input id="telefono" type="tel" className="auth-inp" placeholder="2281234567" autoComplete="tel" aria-required="true" aria-describedby={perfil.formState.errors.telefono ? 'tel-err' : undefined} aria-invalid={!!perfil.formState.errors.telefono} style={inputBase} {...perfil.register('telefono')} />
              <FieldError id="tel-err" message={perfil.formState.errors.telefono?.message} />
            </div>
            <div>
              <label htmlFor="sexo" style={labelBase}>Sexo</label>
              <select id="sexo" className="auth-sel" aria-required="true" style={selectBase} {...perfil.register('sexo')}>
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
                <option value="otro">Otro</option>
              </select>
            </div>
          </div>
          <div className="auth-grid-2">
            <div>
              <label htmlFor="tenencia" style={labelBase}>Tenencia</label>
              <select id="tenencia" className="auth-sel" aria-required="true" style={selectBase} {...perfil.register('tenencia')}>
                <option value="propietario">Propietario</option>
                <option value="inquilino">Inquilino</option>
              </select>
            </div>
            <div>
              <label htmlFor="circuitoId" style={labelBase}>Circuito</label>
              <select id="circuitoId" className="auth-sel" aria-required="true" aria-describedby={perfil.formState.errors.circuitoId ? 'circ-err' : undefined} aria-invalid={!!perfil.formState.errors.circuitoId} style={selectBase} {...perfil.register('circuitoId')}>
                <option value="">Selecciona tu circuito</option>
                {circuitos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <FieldError id="circ-err" message={perfil.formState.errors.circuitoId?.message} />
            </div>
          </div>
          {esInquilino && (
            <fieldset style={{ borderRadius: 16, border: `1px solid ${C.amberBdr}`, background: C.amberBg, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <legend style={{ fontSize: 12.5, fontWeight: 700, color: C.amber, fontFamily: FM, paddingInline: 4 }}>Datos del propietario</legend>
              <div className="auth-grid-2">
                <div>
                  <label htmlFor="nombrePropietario" style={labelBase}>Nombre del propietario</label>
                  <input id="nombrePropietario" type="text" className="auth-inp" placeholder="Nombre completo del dueño" aria-required="true" aria-describedby={perfil.formState.errors.nombrePropietario ? 'nprop-err' : undefined} aria-invalid={!!perfil.formState.errors.nombrePropietario} style={inputBase} {...perfil.register('nombrePropietario')} />
                  <FieldError id="nprop-err" message={perfil.formState.errors.nombrePropietario?.message} />
                </div>
                <div>
                  <label htmlFor="telefonoPropietario" style={labelBase}>Teléfono del propietario</label>
                  <input id="telefonoPropietario" type="tel" className="auth-inp" placeholder="2281234567" aria-required="true" aria-describedby={perfil.formState.errors.telefonoPropietario ? 'tprop-err' : undefined} aria-invalid={!!perfil.formState.errors.telefonoPropietario} style={inputBase} {...perfil.register('telefonoPropietario')} />
                  <FieldError id="tprop-err" message={perfil.formState.errors.telefonoPropietario?.message} />
                </div>
              </div>
            </fieldset>
          )}
          <div className="auth-grid-2">
            <div>
              <label htmlFor="edificio" style={labelBase}>Edificio</label>
              <input id="edificio" type="number" min="1" className="auth-inp" placeholder="8" aria-required="true" aria-describedby={perfil.formState.errors.edificio ? 'edif-err' : undefined} aria-invalid={!!perfil.formState.errors.edificio} style={inputBase} {...perfil.register('edificio')} />
              <FieldError id="edif-err" message={perfil.formState.errors.edificio?.message} />
            </div>
            <div>
              <label htmlFor="deptoNumero" style={labelBase}>Departamento</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <input id="deptoNumero" type="text" inputMode="numeric" className="auth-inp" placeholder="314" aria-required="true" aria-describedby="depto-preview depto-num-err" aria-invalid={!!perfil.formState.errors.deptoNumero} style={inputBase} {...perfil.register('deptoNumero')} />
                  <FieldError id="depto-num-err" message={perfil.formState.errors.deptoNumero?.message} />
                </div>
                <div style={{ width: 60 }}>
                  <input id="deptoLetra" type="text" maxLength={1} className="auth-inp" placeholder="A" aria-label="Letra del departamento (opcional)" aria-describedby="depto-preview depto-letra-err" aria-invalid={!!perfil.formState.errors.deptoLetra} style={{ ...inputBase, textTransform: 'uppercase', textAlign: 'center', padding: '12px 8px' }} {...perfil.register('deptoLetra', { onChange: e => { (e.target as HTMLInputElement).value = (e.target as HTMLInputElement).value.toUpperCase(); } })} />
                  <FieldError id="depto-letra-err" message={perfil.formState.errors.deptoLetra?.message} />
                </div>
              </div>
              <p id="depto-preview" style={{ fontSize: 12, color: C.textWarm, marginTop: 4 }}>Número + letra: <strong aria-live="polite">{deptoNumero || '___'}{deptoLetra}</strong></p>
            </div>
          </div>
          {serverError && <div role="alert" aria-live="assertive" style={{ background: C.dangerBg, border: '1px solid #F3BFBF', borderRadius: 14, padding: '10px 14px', fontSize: 13, color: C.danger, fontWeight: 700 }}>{serverError}</div>}
          <button className="auth-primary" type="submit" disabled={submitting} aria-busy={submitting} style={{ ...buttonGold, opacity: submitting ? 0.75 : 1, marginTop: 2 }}>{submitting ? 'Guardando...' : 'Finalizar registro'}</button>
          <div style={{ textAlign: 'center' }}>
            <button type="button" className="auth-link" style={{ ...linkButton, color: '#C98A0E' }} onClick={() => setPaso(1)}>
              ‹ Volver al paso anterior
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleVerificarWhatsApp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate aria-label="Formulario de verificacion por WhatsApp">
          <p style={{ margin: 0, fontSize: 13.5, color: C.textWarm, lineHeight: 1.45, fontWeight: 700 }}>
            Enviamos un codigo de 6 digitos por WhatsApp al numero {perfil.getValues().telefono}.
          </p>
          <div>
            <label htmlFor="codigo-whatsapp" style={labelBase}>Codigo de WhatsApp</label>
            <input
              id="codigo-whatsapp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              className="auth-inp"
              placeholder="123456"
              autoComplete="one-time-code"
              value={codigoWhatsApp}
              onChange={e => setCodigoWhatsApp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{ ...inputBase, textAlign: 'center', letterSpacing: 4, fontSize: 18 }}
            />
          </div>
          {devCode && (
            <div role="status" style={{ background: C.amberBg, border: `1px solid ${C.amberBdr}`, borderRadius: 14, padding: '10px 14px', fontSize: 13, color: C.amber, fontWeight: 800 }}>
              Codigo de desarrollo: {devCode}
            </div>
          )}
          {serverError && <div role="alert" aria-live="assertive" style={{ background: C.dangerBg, border: '1px solid #F3BFBF', borderRadius: 14, padding: '10px 14px', fontSize: 13, color: C.danger, fontWeight: 700 }}>{serverError}</div>}
          <button className="auth-primary" type="submit" disabled={submitting || codigoWhatsApp.length !== 6} aria-busy={submitting} style={{ ...buttonGold, opacity: submitting || codigoWhatsApp.length !== 6 ? 0.75 : 1, marginTop: 2 }}>
            {submitting ? 'Verificando...' : 'Verificar y finalizar'}
          </button>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '8px 14px' }}>
            <button type="button" className="auth-link" style={{ ...linkButton, color: '#C98A0E' }} onClick={() => setPaso(2)}>
              Volver al perfil
            </button>
            <button type="button" className="auth-link" style={linkButton} disabled={submitting} onClick={handleReenviarCodigo}>
              Reenviar codigo
            </button>
          </div>
        </form>
      )}
    </AuthCard>
  );
}


