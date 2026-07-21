'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';
import { useCircuitos } from '@/hooks/useCircuito';
import { AuthCard, C, inputBase, selectBase, labelBase, buttonGold, linkButton, FM } from '../auth-styles';

const cuentaSchema = z.object({
  nombre: z.string().min(2, 'Ingresa tu nombre completo'),
  email: z.string().email('Correo electrónico inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
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
  const [paso, setPaso] = useState<1 | 2>(1);
  const [serverError, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
      router.push('/verificar-email');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title={paso === 1 ? 'Crear cuenta' : 'Completa tu perfil'}
      subtitle={`Paso ${paso} de 2`}
      maxWidth={paso === 1 ? 420 : 620}
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
        <div style={{ height: '100%', width: paso === 1 ? '50%' : '100%', background: C.greenDk, borderRadius: 999, transition: 'width .35s ease' }} />
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
          {serverError && <div role="alert" aria-live="assertive" style={{ background: C.dangerBg, border: '1px solid #F3BFBF', borderRadius: 14, padding: '10px 14px', fontSize: 13, color: C.danger, fontWeight: 700 }}>{serverError}</div>}
          <button className="auth-primary" type="submit" style={{ ...buttonGold, marginTop: 2 }}>Continuar</button>
        </form>
      ) : (
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
      )}
    </AuthCard>
  );
}
