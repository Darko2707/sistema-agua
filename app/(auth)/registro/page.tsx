'use client';

import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authClient } from '@/lib/auth-client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';
import { homePathForRole } from '@/lib/role-home';
import { useCircuitos } from '@/hooks/useCircuito';
import { userFacingError } from '@/lib/user-facing-error';
import {
  esNombrePersonaValido,
  normalizarNombrePersona,
  NOMBRE_PERSONA_ERROR,
} from '@/src/domain/usuarios/nombre-persona';
import { AuthCard, C, inputBase, selectBase, labelBase, buttonGold, linkButton, FM } from '../auth-styles';

const cuentaSchema = z.object({
  nombre: z.string().trim()
    .min(2, 'Ingresa tu nombre completo')
    .max(120, 'El nombre es demasiado largo')
    .refine(esNombrePersonaValido, NOMBRE_PERSONA_ERROR),
  email: z.string().trim().email('Correo electrónico inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  aceptaLegales: z.literal(true, { error: 'Debes aceptar los terminos y condiciones para continuar' }),
});
type CuentaForm = z.infer<typeof cuentaSchema>;

const TELEFONO_ERROR = 'El telefono debe contener exactamente 10 digitos';

function soloDigitos10(value: string): string {
  return value.replace(/\D/g, '').slice(0, 10);
}

const perfilSchema = z.object({
  telefono: z.string().regex(/^\d{10}$/, TELEFONO_ERROR),
  sexo: z.enum(['masculino', 'femenino', 'otro']),
  tenencia: z.enum(['propietario', 'inquilino']),
  circuitoId: z.string().trim().min(1, 'Selecciona tu circuito'),
  edificio: z.string().trim()
    .regex(/^\d{1,6}$/, 'Usa un número de hasta 6 dígitos')
    .refine(value => /[1-9]/.test(value), 'Debe ser mayor que cero'),
  deptoNumero: z.string().trim()
    .regex(/^\d{1,6}$/, 'Usa un número de hasta 6 dígitos')
    .refine(value => /[1-9]/.test(value), 'Debe ser mayor que cero'),
  deptoLetra: z.string().trim().regex(/^[a-zA-Z]?$/, 'Solo una letra (opcional)').optional(),
  nombrePropietario: z.string().trim().max(120, 'Máximo 120 caracteres').optional(),
  telefonoPropietario: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.tenencia === 'inquilino') {
    if (!data.nombrePropietario || data.nombrePropietario.trim().length < 2) {
      ctx.addIssue({ code: 'custom', message: 'Ingresa el nombre del propietario', path: ['nombrePropietario'] });
    }
    if (!data.telefonoPropietario || !/^\d{10}$/.test(data.telefonoPropietario)) {
      ctx.addIssue({ code: 'custom', message: TELEFONO_ERROR, path: ['telefonoPropietario'] });
    }
    if (data.nombrePropietario && !esNombrePersonaValido(data.nombrePropietario)) {
      ctx.addIssue({ code: 'custom', message: NOMBRE_PERSONA_ERROR, path: ['nombrePropietario'] });
    }
  }
});
type PerfilForm = z.infer<typeof perfilSchema>;

const LEGAL_VERSION = '2026-08-05';

function normalizarNumero(value: string): string {
  return value.trim().replace(/^0+(?=\d)/, '');
}

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
  const [paso, setPaso] = useState<1 | 2>(1);
  const [serverError, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const circuitosQuery = useCircuitos();
  const circuitos = circuitosQuery.data ?? [];

  const cuenta = useForm<CuentaForm>({ resolver: zodResolver(cuentaSchema), mode: 'onTouched' });
  const perfil = useForm<PerfilForm>({
    resolver: zodResolver(perfilSchema),
    mode: 'onTouched',
    defaultValues: { sexo: 'masculino', tenencia: 'propietario', deptoLetra: '' },
  });

  const tenencia = useWatch({ control: perfil.control, name: 'tenencia' });
  const esInquilino = tenencia === 'inquilino';
  const deptoNumero = useWatch({ control: perfil.control, name: 'deptoNumero' }) ?? '';
  const deptoLetra = useWatch({ control: perfil.control, name: 'deptoLetra' }) ?? '';

  useEffect(() => {
    let active = true;

    async function restaurarRegistro() {
      try {
        const sessionResult = await authClient.getSession();
        if (!active || !sessionResult.data?.user) return;

        const role = (sessionResult.data.user as { role?: string }).role ?? 'residente';
        if (role !== 'residente') {
          router.replace(homePathForRole(role));
          return;
        }

        // La cuenta ya existe: nunca se vuelve a intentar el alta del correo.
        setPaso(2);
        const perfilExistente = await trpc.usuarios.miPerfil.query();
        if (!active) return;
        if (perfilExistente) router.replace('/residente');
      } catch (err: unknown) {
        if (active) {
          setError(userFacingError(err, 'SIS4S-100'));
        }
      } finally {
        if (active) setCheckingSession(false);
      }
    }

    void restaurarRegistro();
    return () => { active = false; };
  }, [router]);

  async function aceptarLegales() {
    await trpc.operacion.aceptarLegales.mutate({
      privacidadVersion: LEGAL_VERSION,
      cookiesVersion: LEGAL_VERSION,
      terminosVersion: LEGAL_VERSION,
    });
  }

  async function handleCrearCuenta(data: CuentaForm) {
    setError('');
    setSubmitting(true);
    try {
      // También cubre el caso excepcional en que otra pestaña inició sesión
      // después de la comprobación inicial.
      const currentSession = await authClient.getSession();
      if (currentSession.data?.user) {
        const role = (currentSession.data.user as { role?: string }).role ?? 'residente';
        if (role !== 'residente') {
          router.replace(homePathForRole(role));
          return;
        }
        const perfilExistente = await trpc.usuarios.miPerfil.query();
        if (perfilExistente) {
          router.replace('/residente');
          return;
        }
        await aceptarLegales();
        setPaso(2);
        return;
      }

      const email = data.email.trim().toLowerCase();
      const password = data.password;
      const { error: signUpError } = await authClient.signUp.email({
        email,
        password,
        name: normalizarNombrePersona(data.nombre),
      });
      if (signUpError) {
        throw new Error(signUpError.message ?? 'No se pudo crear la cuenta. El correo podría estar registrado.');
      }

      let sessionResult = await authClient.getSession();
      if (!sessionResult.data?.user) {
        const { error: signInError } = await authClient.signIn.email({ email, password });
        if (signInError) {
          throw new Error('La cuenta fue creada, pero no se pudo iniciar sesión automáticamente. Inicia sesión para continuar.');
        }
        sessionResult = await authClient.getSession();
      }
      if (!sessionResult.data?.user) {
        throw new Error('La cuenta fue creada, pero no pudimos confirmar la sesión. Inicia sesión para continuar.');
      }

      await aceptarLegales();
      setPaso(2);
    } catch (err: unknown) {
      setError(userFacingError(err, 'SIS4S-102'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCompletarPerfil(data: PerfilForm) {
    setError('');
    setSubmitting(true);
    const departamento = `${normalizarNumero(data.deptoNumero)}${(data.deptoLetra ?? '').trim().toUpperCase()}`;
    try {
      await trpc.usuarios.crearPerfil.mutate({
        telefono: data.telefono,
        sexo: data.sexo,
        tenencia: data.tenencia,
        circuitoId: data.circuitoId.trim(),
        edificio: normalizarNumero(data.edificio),
        departamento,
        ...(data.tenencia === 'inquilino' && {
          nombrePropietario: data.nombrePropietario
            ? normalizarNombrePersona(data.nombrePropietario)
            : undefined,
          telefonoPropietario: data.telefonoPropietario,
        }),
      });
      router.replace('/residente');
    } catch (err: unknown) {
      setError(userFacingError(err, 'SIS4S-103'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUsarOtraCuenta() {
    setError('');
    setSubmitting(true);
    try {
      const { error: signOutError } = await authClient.signOut();
      if (signOutError) throw new Error(signOutError.message ?? 'No se pudo cerrar la sesión.');
      cuenta.reset();
      perfil.reset({ sexo: 'masculino', tenencia: 'propietario', deptoLetra: '' });
      setPaso(1);
      router.refresh();
    } catch (err: unknown) {
      setError(userFacingError(err, 'SIS4S-104'));
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingSession) {
    return (
      <AuthCard title="Preparando tu registro" subtitle="Estamos comprobando si ya comenzaste el proceso">
        <div role="status" aria-live="polite" style={{ padding: '24px 0', textAlign: 'center', color: C.textWarm, fontWeight: 700 }}>
          Comprobando sesión...
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={paso === 1 ? 'Crear cuenta' : 'Completa tu perfil'}
      subtitle={`Paso ${paso} de 2`}
      maxWidth={paso === 1 ? 420 : 620}
      footer={paso === 1 ? (
        <>
          ¿Ya tienes cuenta?{' '}
          <Link className="auth-link" style={linkButton} href="/login">
            Inicia sesión
          </Link>
        </>
      ) : undefined}
    >
      <div style={{ height: 5, background: '#EFE6D2', borderRadius: 999, overflow: 'hidden', margin: '0 0 20px' }}>
        <div style={{ height: '100%', width: paso === 1 ? '50%' : '100%', background: C.greenDk, borderRadius: 999, transition: 'width .35s ease' }} />
      </div>

      {paso === 1 ? (
        <form onSubmit={cuenta.handleSubmit(handleCrearCuenta)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate aria-label="Formulario de creación de cuenta">
          <div>
            <label htmlFor="nombre" style={labelBase}>Nombre completo</label>
            <input
              id="nombre"
              type="text"
              maxLength={120}
              className="auth-inp"
              placeholder="Juan Pérez"
              autoComplete="name"
              autoCapitalize="words"
              aria-required="true"
              aria-describedby={cuenta.formState.errors.nombre ? 'nombre-hint nombre-err' : 'nombre-hint'}
              aria-invalid={!!cuenta.formState.errors.nombre}
              style={{ ...inputBase, textTransform: 'capitalize' }}
              {...cuenta.register('nombre', {
                onBlur: (event) => {
                  const value = String(event.target.value);
                  if (esNombrePersonaValido(value)) {
                    cuenta.setValue('nombre', normalizarNombrePersona(value), {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }
                },
              })}
            />
            <p id="nombre-hint" style={{ fontSize: 12, color: C.textWarm, marginTop: 4 }}>Sólo letras y espacios. Cada nombre o apellido se guardará con inicial mayúscula.</p>
            <FieldError id="nombre-err" message={cuenta.formState.errors.nombre?.message} />
          </div>
          <div>
            <label htmlFor="reg-email" style={labelBase}>Correo electrónico</label>
            <input id="reg-email" type="email" className="auth-inp" placeholder="tu@correo.com" autoComplete="email" aria-required="true" aria-describedby={cuenta.formState.errors.email ? 'email-hint email-err' : 'email-hint'} aria-invalid={!!cuenta.formState.errors.email} style={inputBase} {...cuenta.register('email')} />
            <p id="email-hint" style={{ fontSize: 12, color: C.textWarm, marginTop: 4 }}>Se usa para iniciar sesión; no enviaremos un código de confirmación.</p>
            <FieldError id="email-err" message={cuenta.formState.errors.email?.message} />
          </div>
          <div>
            <label htmlFor="reg-password" style={labelBase}>Contraseña</label>
            <input id="reg-password" type="password" className="auth-inp" placeholder="mínimo 8 caracteres" autoComplete="new-password" aria-required="true" aria-describedby={cuenta.formState.errors.password ? 'pwd-err' : 'pwd-hint'} aria-invalid={!!cuenta.formState.errors.password} style={inputBase} {...cuenta.register('password')} />
            <p id="pwd-hint" style={{ fontSize: 12, color: C.textWarm, marginTop: 4 }}>Mínimo 8 caracteres.</p>
            <FieldError id="pwd-err" message={cuenta.formState.errors.password?.message} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5, color: C.textWarm, lineHeight: 1.45, fontWeight: 700 }}>
            <input
              id="acepta-legales"
              type="checkbox"
              aria-required="true"
              aria-invalid={!!cuenta.formState.errors.aceptaLegales}
              aria-describedby={cuenta.formState.errors.aceptaLegales ? 'legales-text legales-err' : 'legales-text'}
              style={{ marginTop: 2, accentColor: C.greenDk }}
              {...cuenta.register('aceptaLegales')}
            />
            <span id="legales-text">
              <label htmlFor="acepta-legales">He leído y acepto </label>
              los <Link className="auth-link" style={{ ...linkButton, fontSize: 12.5 }} href="/terminos">términos y condiciones</Link>, la <Link className="auth-link" style={{ ...linkButton, fontSize: 12.5 }} href="/privacidad">política de privacidad</Link> y la <Link className="auth-link" style={{ ...linkButton, fontSize: 12.5 }} href="/cookies">política de cookies</Link>.
            </span>
          </div>
          <FieldError id="legales-err" message={cuenta.formState.errors.aceptaLegales?.message} />
          {serverError && <div role="alert" aria-live="assertive" style={{ background: C.dangerBg, border: '1px solid #F3BFBF', borderRadius: 14, padding: '10px 14px', fontSize: 13, color: C.danger, fontWeight: 700 }}>{serverError}</div>}
          <button className="auth-primary" type="submit" disabled={submitting} aria-busy={submitting} style={{ ...buttonGold, opacity: submitting ? 0.75 : 1, marginTop: 2 }}>
            {submitting ? 'Creando cuenta...' : 'Continuar'}
          </button>
        </form>
      ) : (
        <form onSubmit={perfil.handleSubmit(handleCompletarPerfil)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate aria-label="Formulario de perfil de residente">
          <div className="auth-grid-2">
            <div>
              <label htmlFor="telefono" style={labelBase}>Teléfono</label>
              <input
                id="telefono"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                pattern="[0-9]{10}"
                className="auth-inp"
                placeholder="2281234567"
                autoComplete="tel"
                aria-required="true"
                aria-describedby={perfil.formState.errors.telefono ? 'tel-hint tel-err' : 'tel-hint'}
                aria-invalid={!!perfil.formState.errors.telefono}
                style={inputBase}
                {...perfil.register('telefono', {
                  onChange: (event) => {
                    const input = event.target as HTMLInputElement;
                    input.value = soloDigitos10(input.value);
                  },
                })}
              />
              <p id="tel-hint" style={{ fontSize: 12, color: C.textWarm, marginTop: 4 }}>Debe contener exactamente 10 digitos. Es un dato de contacto administrativo.</p>
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
              <select id="circuitoId" className="auth-sel" disabled={circuitosQuery.isLoading || circuitosQuery.isError} aria-required="true" aria-describedby={perfil.formState.errors.circuitoId ? 'circ-status circ-err' : 'circ-status'} aria-invalid={!!perfil.formState.errors.circuitoId || circuitosQuery.isError} style={{ ...selectBase, opacity: circuitosQuery.isLoading || circuitosQuery.isError ? 0.7 : 1 }} {...perfil.register('circuitoId')}>
                <option value="">{circuitosQuery.isLoading ? 'Cargando circuitos...' : 'Selecciona tu circuito'}</option>
                {circuitos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <p id="circ-status" role={circuitosQuery.isError ? 'alert' : 'status'} style={{ fontSize: 12, color: circuitosQuery.isError ? C.danger : C.textWarm, marginTop: 4 }}>
                {circuitosQuery.isError
                  ? 'No pudimos cargar los circuitos. Recarga la página para intentar nuevamente.'
                  : !circuitosQuery.isLoading && circuitos.length === 0
                    ? 'No hay circuitos disponibles para registro.'
                    : ''}
              </p>
              <FieldError id="circ-err" message={perfil.formState.errors.circuitoId?.message} />
            </div>
          </div>
          {esInquilino && (
            <fieldset style={{ borderRadius: 16, border: `1px solid ${C.amberBdr}`, background: C.amberBg, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <legend style={{ fontSize: 12.5, fontWeight: 700, color: C.amber, fontFamily: FM, paddingInline: 4 }}>Datos del propietario</legend>
              <div className="auth-grid-2">
                <div>
                  <label htmlFor="nombrePropietario" style={labelBase}>Nombre del propietario</label>
                  <input id="nombrePropietario" type="text" maxLength={120} autoComplete="name" autoCapitalize="words" className="auth-inp" placeholder="Nombre completo del dueño" aria-required="true" aria-describedby={perfil.formState.errors.nombrePropietario ? 'nprop-err' : undefined} aria-invalid={!!perfil.formState.errors.nombrePropietario} style={{ ...inputBase, textTransform: 'capitalize' }} {...perfil.register('nombrePropietario', { onBlur: (event) => { const value = String(event.target.value); if (esNombrePersonaValido(value)) perfil.setValue('nombrePropietario', normalizarNombrePersona(value), { shouldDirty: true, shouldValidate: true }); } })} />
                  <FieldError id="nprop-err" message={perfil.formState.errors.nombrePropietario?.message} />
                </div>
                <div>
                  <label htmlFor="telefonoPropietario" style={labelBase}>Teléfono del propietario</label>
                  <input
                    id="telefonoPropietario"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    pattern="[0-9]{10}"
                    className="auth-inp"
                    placeholder="2281234567"
                    aria-required="true"
                    aria-describedby={perfil.formState.errors.telefonoPropietario ? 'tprop-err' : undefined}
                    aria-invalid={!!perfil.formState.errors.telefonoPropietario}
                    style={inputBase}
                    {...perfil.register('telefonoPropietario', {
                      onChange: (event) => {
                        const input = event.target as HTMLInputElement;
                        input.value = soloDigitos10(input.value);
                      },
                    })}
                  />
                  <FieldError id="tprop-err" message={perfil.formState.errors.telefonoPropietario?.message} />
                </div>
              </div>
            </fieldset>
          )}
          <div className="auth-grid-2">
            <div>
              <label htmlFor="edificio" style={labelBase}>Edificio</label>
              <input id="edificio" type="text" inputMode="numeric" maxLength={6} className="auth-inp" placeholder="1" aria-required="true" aria-describedby={perfil.formState.errors.edificio ? 'edif-err' : undefined} aria-invalid={!!perfil.formState.errors.edificio} style={inputBase} {...perfil.register('edificio')} />
              <FieldError id="edif-err" message={perfil.formState.errors.edificio?.message} />
            </div>
            <div>
              <label htmlFor="deptoNumero" style={labelBase}>Departamento</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <input id="deptoNumero" type="text" inputMode="numeric" maxLength={6} className="auth-inp" placeholder="31" aria-required="true" aria-describedby="depto-preview depto-num-err" aria-invalid={!!perfil.formState.errors.deptoNumero} style={inputBase} {...perfil.register('deptoNumero')} />
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
          <div role="note" style={{ borderRadius: 14, border: `1px solid ${C.amberBdr}`, background: C.amberBg, padding: '10px 14px', fontSize: 12.5, lineHeight: 1.45, color: C.amber, fontWeight: 700 }}>
            Solo puede existir un registro por circuito, edificio y departamento. Verifica estos datos antes de finalizar.
          </div>
          {serverError && <div role="alert" aria-live="assertive" style={{ background: C.dangerBg, border: '1px solid #F3BFBF', borderRadius: 14, padding: '10px 14px', fontSize: 13, color: C.danger, fontWeight: 700 }}>{serverError}</div>}
          <button className="auth-primary" type="submit" disabled={submitting || circuitosQuery.isLoading || circuitosQuery.isError || circuitos.length === 0} aria-busy={submitting} style={{ ...buttonGold, opacity: submitting || circuitosQuery.isLoading || circuitosQuery.isError || circuitos.length === 0 ? 0.65 : 1, marginTop: 2 }}>{submitting ? 'Guardando...' : 'Finalizar registro'}</button>
          <div style={{ textAlign: 'center' }}>
            <button type="button" className="auth-link" disabled={submitting} style={{ ...linkButton, color: '#C98A0E', opacity: submitting ? 0.65 : 1 }} onClick={handleUsarOtraCuenta}>
              Cerrar sesión y usar otra cuenta
            </button>
          </div>
        </form>
      )}
    </AuthCard>
  );
}
