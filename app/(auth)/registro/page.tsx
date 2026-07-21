'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { trpc } from '@/lib/trpc-client';
import { useCircuitos } from '@/hooks/useCircuito';

// ── Zod schemas ───────────────────────────────────────────────────────────────
const cuentaSchema = z.object({
  nombre:   z.string().min(2, 'Ingresa tu nombre completo'),
  email:    z.string().email('Correo electrónico inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
});
type CuentaForm = z.infer<typeof cuentaSchema>;

const perfilSchema = z.object({
  telefono:            z.string().min(10, 'Mínimo 10 dígitos').regex(/^\d+$/, 'Solo números'),
  sexo:                z.enum(['masculino', 'femenino', 'otro']),
  tenencia:            z.enum(['propietario', 'inquilino']),
  circuitoId:          z.string().min(1, 'Selecciona tu circuito'),
  edificio:            z.string().min(1, 'Ingresa el número de edificio'),
  deptoNumero:         z.string().min(1, 'Ingresa el número de departamento').regex(/^\d+$/, 'Solo dígitos'),
  deptoLetra:          z.string().regex(/^[a-zA-Z]?$/, 'Solo una letra (opcional)').optional(),
  nombrePropietario:   z.string().optional(),
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

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  green:    '#15493A',
  gold:     '#F4B223',
  bg:       '#F0EEE6',
  border:   '#D8D4C8',
  textMain: '#1F2A22',
  textMute: '#8A8879',
  danger:   '#C0453F',
  dangerBg: '#FBEAE9',
  amber:    '#7A5800',
  amberBg:  '#FFFBEE',
  amberBdr: '#F8D57E',
} as const;

const FM = "var(--font-manrope), 'Manrope', sans-serif";
const FS = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";

const inputBase: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 14px', borderRadius: 12,
  border: `1.5px solid ${C.border}`,
  fontSize: 14, fontFamily: FM, color: C.textMain, background: '#fff',
  outline: 'none', transition: 'border-color .15s, box-shadow .15s',
};

const selectBase: React.CSSProperties = {
  ...inputBase, cursor: 'pointer',
  appearance: 'none' as React.CSSProperties['appearance'],
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238A8879' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
  paddingRight: 36,
};

const labelBase: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 700,
  color: C.textMain, fontFamily: FM, marginBottom: 5,
};

const btnGreen: React.CSSProperties = {
  width: '100%', padding: '12px', borderRadius: 13,
  background: C.green, color: '#fff', border: 'none',
  fontFamily: FM, fontSize: 14, fontWeight: 700, cursor: 'pointer',
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" aria-live="polite"
      style={{ margin: '4px 0 0', fontSize: 12, color: C.danger, fontFamily: FM }}>
      {message}
    </p>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RegistroPage() {
  const router = useRouter();
  const [paso, setPaso]             = useState<1 | 2>(1);
  const [serverError, setError]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  const circuitosQuery = useCircuitos();
  const circuitos      = circuitosQuery.data ?? [];

  const cuenta = useForm<CuentaForm>({
    resolver: zodResolver(cuentaSchema),
    mode: 'onTouched',
  });

  const perfil = useForm<PerfilForm>({
    resolver: zodResolver(perfilSchema),
    mode: 'onTouched',
    defaultValues: { sexo: 'masculino', tenencia: 'propietario', deptoLetra: '' },
  });
  const tenencia    = perfil.watch('tenencia');
  const esInquilino = tenencia === 'inquilino';
  const deptoNumero = perfil.watch('deptoNumero') ?? '';
  const deptoLetra  = perfil.watch('deptoLetra') ?? '';

  async function handleCrearCuenta(data: CuentaForm) {
    setError('');
    void data;
    setPaso(2);
  }

  async function handleCompletarPerfil(data: PerfilForm) {
    setError('');
    setSubmitting(true);
    const cuentaData   = cuenta.getValues();
    const departamento = `${data.deptoNumero.trim()}${(data.deptoLetra ?? '').trim()}`;
    try {
      const { error: signUpError } = await authClient.signUp.email({
        email: cuentaData.email, password: cuentaData.password, name: cuentaData.nombre,
      });
      if (signUpError) {
        setPaso(1);
        throw new Error(signUpError.message ?? 'No se pudo crear la cuenta. El correo podría estar registrado.');
      }
      const { error: signInError } = await authClient.signIn.email({
        email: cuentaData.email, password: cuentaData.password,
      });
      if (signInError) throw new Error('Cuenta creada, pero no se pudo iniciar sesión automáticamente.');
      await trpc.usuarios.crearPerfil.mutate({
        telefono: data.telefono, sexo: data.sexo, tenencia: data.tenencia,
        circuitoId: data.circuitoId, edificio: data.edificio, departamento,
        ...(esInquilino && {
          nombrePropietario:   data.nombrePropietario?.trim(),
          telefonoPropietario: data.telefonoPropietario?.trim(),
        }),
      });
      router.push('/verificar-email');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSubmitting(false);
    }
  }

  const maxW = paso === 1 ? 420 : 620;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px 40px', fontFamily: FM }}>
      <style>{`
        .rg-inp:focus { border-color: #15493A !important; box-shadow: 0 0 0 3px rgba(21,73,58,.12) !important; }
        .rg-sel:focus { border-color: #15493A !important; box-shadow: 0 0 0 3px rgba(21,73,58,.12) !important; }
        .rg-lnk { background: none; border: none; padding: 0; font-family: inherit; font-size: 13px; font-weight: 600; color: #15493A; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
        .rg-lnk:hover { color: #0F3B2D; }
        .rg-grid-2 { display: grid; grid-template-columns: 1fr; gap: 14px; }
        @media(min-width: 560px) { .rg-grid-2 { grid-template-columns: 1fr 1fr; } }
      `}</style>

      <div style={{ width: '100%', maxWidth: maxW, background: '#fff', borderRadius: 24, boxShadow: '0 20px 60px rgba(0,0,0,.12), 0 4px 16px rgba(0,0,0,.06)', overflow: 'hidden' }}>

        {/* ── Green header ── */}
        <div style={{ background: C.green, padding: '26px 28px 20px', textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, overflow: 'hidden', background: '#fff', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Image src="/logo1SIS4S.png" alt="SIS4S Logo" width={52} height={52} style={{ objectFit: 'contain' }} priority />
          </div>
          <div style={{ fontFamily: FS, fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
            {paso === 1 ? 'Crear cuenta' : 'Completa tu perfil'}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.60)', marginTop: 4 }}>
            Paso {paso} de 2
          </div>
          <div style={{ marginTop: 12, height: 4, background: 'rgba(255,255,255,.18)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: paso === 1 ? '50%' : '100%', background: C.gold, borderRadius: 4, transition: 'width .4s ease' }} />
          </div>
        </div>

        {/* ── Form body ── */}
        <div style={{ padding: '24px 28px 28px' }}>
          {paso === 1 ? (
            /* ── Paso 1 ── */
            <form onSubmit={cuenta.handleSubmit(handleCrearCuenta)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate aria-label="Formulario de creación de cuenta">
              <div>
                <label htmlFor="nombre" style={labelBase}>Nombre completo</label>
                <input id="nombre" type="text" className="rg-inp" placeholder="Juan Pérez"
                  autoComplete="name" aria-required="true"
                  aria-describedby={cuenta.formState.errors.nombre ? 'nombre-err' : undefined}
                  aria-invalid={!!cuenta.formState.errors.nombre}
                  style={inputBase} {...cuenta.register('nombre')} />
                <FieldError id="nombre-err" message={cuenta.formState.errors.nombre?.message} />
              </div>

              <div>
                <label htmlFor="reg-email" style={labelBase}>Correo electrónico</label>
                <input id="reg-email" type="email" className="rg-inp" placeholder="tu@correo.com"
                  autoComplete="email" aria-required="true"
                  aria-describedby={cuenta.formState.errors.email ? 'email-err' : undefined}
                  aria-invalid={!!cuenta.formState.errors.email}
                  style={inputBase} {...cuenta.register('email')} />
                <FieldError id="email-err" message={cuenta.formState.errors.email?.message} />
              </div>

              <div>
                <label htmlFor="reg-password" style={labelBase}>Contraseña</label>
                <input id="reg-password" type="password" className="rg-inp" placeholder="mínimo 8 caracteres"
                  autoComplete="new-password" aria-required="true"
                  aria-describedby={cuenta.formState.errors.password ? 'pwd-err' : 'pwd-hint'}
                  aria-invalid={!!cuenta.formState.errors.password}
                  style={inputBase} {...cuenta.register('password')} />
                <p id="pwd-hint" style={{ fontSize: 12, color: C.textMute, marginTop: 4 }}>Mínimo 8 caracteres.</p>
                <FieldError id="pwd-err" message={cuenta.formState.errors.password?.message} />
              </div>

              {serverError && (
                <div role="alert" aria-live="assertive" style={{ background: C.dangerBg, border: '1px solid #F3BFBF', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: C.danger, fontWeight: 600 }}>
                  {serverError}
                </div>
              )}

              <button type="submit" style={{ ...btnGreen, marginTop: 2 }}>Continuar</button>

              <div style={{ textAlign: 'center', fontSize: 13, color: C.textMute }}>
                ¿Ya tienes cuenta?{' '}
                <button type="button" className="rg-lnk" onClick={() => router.push('/login')}>
                  Inicia sesión
                </button>
              </div>
            </form>
          ) : (
            /* ── Paso 2 ── */
            <form onSubmit={perfil.handleSubmit(handleCompletarPerfil)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate aria-label="Formulario de perfil de residente">

              {/* Teléfono + Sexo */}
              <div className="rg-grid-2">
                <div>
                  <label htmlFor="telefono" style={labelBase}>Teléfono</label>
                  <input id="telefono" type="tel" className="rg-inp" placeholder="2281234567"
                    autoComplete="tel" aria-required="true"
                    aria-describedby={perfil.formState.errors.telefono ? 'tel-err' : undefined}
                    aria-invalid={!!perfil.formState.errors.telefono}
                    style={inputBase} {...perfil.register('telefono')} />
                  <FieldError id="tel-err" message={perfil.formState.errors.telefono?.message} />
                </div>
                <div>
                  <label htmlFor="sexo" style={labelBase}>Sexo</label>
                  <select id="sexo" className="rg-sel" aria-required="true"
                    style={selectBase} {...perfil.register('sexo')}>
                    <option value="masculino">Masculino</option>
                    <option value="femenino">Femenino</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>

              {/* Tenencia + Circuito */}
              <div className="rg-grid-2">
                <div>
                  <label htmlFor="tenencia" style={labelBase}>Tenencia</label>
                  <select id="tenencia" className="rg-sel" aria-required="true"
                    style={selectBase} {...perfil.register('tenencia')}>
                    <option value="propietario">Propietario</option>
                    <option value="inquilino">Inquilino</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="circuitoId" style={labelBase}>Circuito</label>
                  <select id="circuitoId" className="rg-sel" aria-required="true"
                    aria-describedby={perfil.formState.errors.circuitoId ? 'circ-err' : undefined}
                    aria-invalid={!!perfil.formState.errors.circuitoId}
                    style={selectBase} {...perfil.register('circuitoId')}>
                    <option value="">Selecciona tu circuito</option>
                    {circuitos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                  <FieldError id="circ-err" message={perfil.formState.errors.circuitoId?.message} />
                </div>
              </div>

              {/* Datos del propietario (solo inquilino) */}
              {esInquilino && (
                <fieldset style={{ borderRadius: 14, border: `1px solid ${C.amberBdr}`, background: C.amberBg, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <legend style={{ fontSize: 12.5, fontWeight: 600, color: C.amber, fontFamily: FM, paddingInline: 4 }}>
                    Como inquilino, necesitamos los datos del propietario del departamento.
                  </legend>
                  <div className="rg-grid-2">
                    <div>
                      <label htmlFor="nombrePropietario" style={labelBase}>Nombre del propietario</label>
                      <input id="nombrePropietario" type="text" className="rg-inp"
                        placeholder="Nombre completo del dueño" aria-required="true"
                        aria-describedby={perfil.formState.errors.nombrePropietario ? 'nprop-err' : undefined}
                        aria-invalid={!!perfil.formState.errors.nombrePropietario}
                        style={inputBase} {...perfil.register('nombrePropietario')} />
                      <FieldError id="nprop-err" message={perfil.formState.errors.nombrePropietario?.message} />
                    </div>
                    <div>
                      <label htmlFor="telefonoPropietario" style={labelBase}>Teléfono del propietario</label>
                      <input id="telefonoPropietario" type="tel" className="rg-inp"
                        placeholder="2281234567" aria-required="true"
                        aria-describedby={perfil.formState.errors.telefonoPropietario ? 'tprop-err' : undefined}
                        aria-invalid={!!perfil.formState.errors.telefonoPropietario}
                        style={inputBase} {...perfil.register('telefonoPropietario')} />
                      <FieldError id="tprop-err" message={perfil.formState.errors.telefonoPropietario?.message} />
                    </div>
                  </div>
                </fieldset>
              )}

              {/* Edificio + Departamento */}
              <div className="rg-grid-2">
                <div>
                  <label htmlFor="edificio" style={labelBase}>Edificio</label>
                  <input id="edificio" type="number" min="1" className="rg-inp" placeholder="8"
                    aria-required="true"
                    aria-describedby={perfil.formState.errors.edificio ? 'edif-err' : undefined}
                    aria-invalid={!!perfil.formState.errors.edificio}
                    style={inputBase} {...perfil.register('edificio')} />
                  <FieldError id="edif-err" message={perfil.formState.errors.edificio?.message} />
                </div>
                <div>
                  <label htmlFor="deptoNumero" style={labelBase}>Departamento</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <input id="deptoNumero" type="text" inputMode="numeric" className="rg-inp"
                        placeholder="314" aria-required="true"
                        aria-describedby="depto-preview depto-num-err"
                        aria-invalid={!!perfil.formState.errors.deptoNumero}
                        style={inputBase} {...perfil.register('deptoNumero')} />
                      <FieldError id="depto-num-err" message={perfil.formState.errors.deptoNumero?.message} />
                    </div>
                    <div style={{ width: 60 }}>
                      <input id="deptoLetra" type="text" maxLength={1} className="rg-inp" placeholder="A"
                        aria-label="Letra del departamento (opcional)"
                        aria-describedby="depto-preview depto-letra-err"
                        aria-invalid={!!perfil.formState.errors.deptoLetra}
                        style={{ ...inputBase, textTransform: 'uppercase', textAlign: 'center', padding: '10px 8px' }}
                        {...perfil.register('deptoLetra', {
                          onChange: e => { (e.target as HTMLInputElement).value = (e.target as HTMLInputElement).value.toUpperCase(); },
                        })} />
                      <FieldError id="depto-letra-err" message={perfil.formState.errors.deptoLetra?.message} />
                    </div>
                  </div>
                  <p id="depto-preview" style={{ fontSize: 12, color: C.textMute, marginTop: 4 }}>
                    Número + letra:{' '}
                    <strong aria-live="polite">{deptoNumero || '___'}{deptoLetra}</strong>
                  </p>
                </div>
              </div>

              {serverError && (
                <div role="alert" aria-live="assertive" style={{ background: C.dangerBg, border: '1px solid #F3BFBF', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: C.danger, fontWeight: 600 }}>
                  {serverError}
                </div>
              )}

              <button type="submit" disabled={submitting} aria-busy={submitting}
                style={{ ...btnGreen, opacity: submitting ? 0.75 : 1, marginTop: 2 }}>
                {submitting ? 'Guardando...' : 'Finalizar registro'}
              </button>

              <div style={{ textAlign: 'center' }}>
                <button type="button" className="rg-lnk" style={{ color: C.textMute, fontWeight: 500 }}
                  onClick={() => setPaso(1)}>
                  ← Volver al paso anterior
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
