'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle2, LoaderCircle, X } from 'lucide-react';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushEnvironment,
  PushClientError,
  syncExistingPushSubscription,
  type PushEnvironment,
} from '@/lib/push-client';

type PushStatus =
  | 'checking'
  | 'available'
  | 'ios-install-required'
  | 'unsupported'
  | 'denied'
  | 'enabling'
  | 'subscribed'
  | 'disabling'
  | 'error';

const COLORS = {
  green: '#15493A',
  greenLight: '#E6F1E5',
  gold: '#F4B223',
  cream: '#FBF6EB',
  text: '#3A3528',
  muted: '#7D725B',
  danger: '#B14A18',
  dangerBg: '#FBE4D6',
  border: '#EADDC4',
};

function initialEnvironment(): PushEnvironment {
  return { supported: false, isIos: false, isStandalone: false, permission: 'unsupported' };
}

function wasDismissedThisSession(): boolean {
  try {
    return sessionStorage.getItem('sis4s-push-prompt-dismissed') === '1';
  } catch {
    return false;
  }
}

function dismissThisSession(): void {
  try {
    sessionStorage.setItem('sis4s-push-prompt-dismissed', '1');
  } catch {
    // El modo privado puede bloquear sessionStorage; cerrar aún funciona en memoria.
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof PushClientError) return error.message;
  return 'No pudimos configurar las notificaciones. Intenta nuevamente.';
}

export function PushNotificationManager() {
  const [environment, setEnvironment] = useState<PushEnvironment>(initialEnvironment);
  const [status, setStatus] = useState<PushStatus>('checking');
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;

    async function initialize() {
      const detected = getPushEnvironment();
      if (!active) return;
      setEnvironment(detected);

      if (detected.isIos && !detected.isStandalone) {
        setStatus('ios-install-required');
        setOpen(false);
        return;
      }
      if (!detected.supported) {
        setStatus('unsupported');
        setOpen(false);
        return;
      }
      if (detected.permission === 'denied') {
        setStatus('denied');
        setOpen(false);
        return;
      }

      if (detected.permission === 'granted') {
        try {
          const subscription = await syncExistingPushSubscription();
          if (!active) return;
          setStatus(subscription ? 'subscribed' : 'available');
          setOpen(!subscription && !wasDismissedThisSession());
          return;
        } catch (error) {
          if (!active) return;
          setMessage(errorMessage(error));
          setStatus('error');
          setOpen(true);
          return;
        }
      }

      setStatus('available');
      setOpen(!wasDismissedThisSession());
    }

    void initialize();
    return () => { active = false; };
  }, []);

  async function refreshAndOpen() {
    setMessage('');
    setOpen(true);

    const detected = getPushEnvironment();
    setEnvironment(detected);

    if (detected.isIos && !detected.isStandalone) {
      setStatus('ios-install-required');
      return;
    }
    if (!detected.supported) {
      setStatus('unsupported');
      return;
    }
    if (detected.permission === 'denied') {
      setStatus('denied');
      return;
    }
    if (detected.permission !== 'granted') {
      setStatus('available');
      return;
    }

    try {
      const subscription = await syncExistingPushSubscription();
      setStatus(subscription ? 'subscribed' : 'available');
    } catch (error) {
      setMessage(errorMessage(error));
      setStatus('error');
    }
  }

  async function activate() {
    setMessage('');
    setStatus('enabling');

    try {
      await enablePushNotifications();
      setEnvironment(getPushEnvironment());
      setStatus('subscribed');
      setOpen(true);
    } catch (error) {
      const nextEnvironment = getPushEnvironment();
      setEnvironment(nextEnvironment);
      setMessage(errorMessage(error));

      if (error instanceof PushClientError && error.code === 'permission-denied') {
        setStatus('denied');
      } else if (error instanceof PushClientError && error.code === 'ios-install-required') {
        setStatus('ios-install-required');
      } else if (error instanceof PushClientError && error.code === 'unsupported') {
        setStatus('unsupported');
      } else {
        setStatus('error');
      }
      setOpen(true);
    }
  }

  async function deactivate() {
    setMessage('');
    setStatus('disabling');

    try {
      await disablePushNotifications();
      setEnvironment(getPushEnvironment());
      setStatus('available');
      setMessage('Las notificaciones se desactivaron en este dispositivo.');
    } catch (error) {
      setMessage(errorMessage(error));
      setStatus('error');
    }
    setOpen(true);
  }

  function closePanel() {
    dismissThisSession();
    setOpen(false);
  }

  if (status === 'checking') return null;

  const isBusy = status === 'enabling' || status === 'disabling';
  const isSubscribed = status === 'subscribed' || status === 'disabling';

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => void refreshAndOpen()}
        aria-label={isSubscribed ? 'Notificaciones push activas' : 'Configurar notificaciones push'}
        title={isSubscribed ? 'Notificaciones activas' : 'Configurar notificaciones'}
        style={{
          position: 'fixed',
          right: 18,
          bottom: 18,
          zIndex: 60,
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: `1px solid ${isSubscribed ? '#B8D5C6' : COLORS.border}`,
          background: isSubscribed ? COLORS.green : '#fff',
          color: isSubscribed ? '#fff' : COLORS.green,
          boxShadow: '0 10px 30px rgba(42,52,40,.22)',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
        }}
      >
        {isSubscribed ? <Bell size={21} aria-hidden="true" /> : <BellOff size={21} aria-hidden="true" />}
      </button>
    );
  }

  const content = (() => {
    if (status === 'subscribed' || status === 'disabling') {
      return {
        Icon: CheckCircle2,
        iconColor: COLORS.green,
        iconBackground: COLORS.greenLight,
        title: 'Notificaciones activas',
        body: 'Este dispositivo recibirá confirmaciones de pago y avisos antes de un posible corte.',
      };
    }
    if (status === 'ios-install-required') {
      return {
        Icon: Bell,
        iconColor: COLORS.green,
        iconBackground: COLORS.cream,
        title: 'Instala SIS4S en tu iPhone o iPad',
        body: 'En tu navegador toca Compartir, elige “Agregar a pantalla de inicio” y abre SIS4S desde su nuevo icono. Después podrás activar los avisos.',
      };
    }
    if (status === 'denied') {
      return {
        Icon: BellOff,
        iconColor: COLORS.danger,
        iconBackground: COLORS.dangerBg,
        title: 'Notificaciones bloqueadas',
        body: 'La app no puede volver a mostrar el permiso. Habilita las notificaciones para este sitio desde la configuración del navegador.',
      };
    }
    if (status === 'unsupported') {
      return {
        Icon: BellOff,
        iconColor: COLORS.danger,
        iconBackground: COLORS.dangerBg,
        title: 'Este navegador no admite avisos push',
        body: 'Consulta el estado de tus pagos y del servicio directamente en SIS4S.',
      };
    }
    return {
      Icon: Bell,
      iconColor: COLORS.green,
      iconBackground: COLORS.cream,
      title: status === 'error' ? 'No pudimos actualizar los avisos' : 'Activa las notificaciones push',
      body: 'Recibe confirmaciones de pago y avisos antes de un posible corte en este dispositivo.',
    };
  })();

  return (
    <aside
      role="dialog"
      aria-labelledby="push-notifications-title"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 14,
        zIndex: 60,
        width: 'min(420px, calc(100% - 28px))',
        transform: 'translateX(-50%)',
        border: `1px solid ${COLORS.border}`,
        borderRadius: 20,
        background: '#fff',
        color: COLORS.text,
        boxShadow: '0 18px 54px rgba(42,52,40,.24)',
        padding: 16,
        fontFamily: "var(--font-mulish), 'Mulish', sans-serif",
      }}
    >
      <button
        type="button"
        onClick={closePanel}
        aria-label="Cerrar configuración de notificaciones"
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          width: 34,
          height: 34,
          display: 'grid',
          placeItems: 'center',
          border: 0,
          borderRadius: '50%',
          background: 'transparent',
          color: COLORS.muted,
          cursor: 'pointer',
        }}
      >
        <X size={18} aria-hidden="true" />
      </button>

      <div style={{ display: 'flex', gap: 12, paddingRight: 28, alignItems: 'flex-start' }}>
        <span
          aria-hidden="true"
          style={{
            width: 42,
            height: 42,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: '50%',
            color: content.iconColor,
            background: content.iconBackground,
          }}
        >
          <content.Icon size={21} />
        </span>
        <div>
          <h2 id="push-notifications-title" style={{ margin: 0, fontSize: 16, lineHeight: 1.3, fontWeight: 800 }}>{content.title}</h2>
          <p style={{ margin: '5px 0 0', color: COLORS.muted, fontSize: 13, lineHeight: 1.5 }}>{content.body}</p>
        </div>
      </div>

      {message && (
        <p
          role={status === 'error' ? 'alert' : 'status'}
          style={{
            margin: '12px 0 0',
            borderRadius: 12,
            background: status === 'error' ? COLORS.dangerBg : COLORS.greenLight,
            color: status === 'error' ? COLORS.danger : COLORS.green,
            padding: '9px 11px',
            fontSize: 12.5,
            fontWeight: 700,
          }}
        >
          {message}
        </p>
      )}

      {(status === 'available' || status === 'error' || status === 'enabling') && (
        <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => void activate()}
            disabled={isBusy}
            aria-busy={status === 'enabling'}
            style={{
              flex: 1,
              minHeight: 44,
              border: 0,
              borderRadius: 13,
              background: COLORS.gold,
              color: '#5A3D06',
              fontSize: 13.5,
              fontWeight: 800,
              cursor: isBusy ? 'wait' : 'pointer',
              opacity: isBusy ? 0.75 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {status === 'enabling' && <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />}
            {status === 'enabling'
              ? 'Activando...'
              : environment.permission === 'granted'
                ? 'Reactivar avisos'
                : 'Activar avisos'}
          </button>
          {status !== 'error' && (
            <button
              type="button"
              onClick={closePanel}
              disabled={isBusy}
              style={{ border: 0, background: 'transparent', color: COLORS.muted, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 8 }}
            >
              Ahora no
            </button>
          )}
        </div>
      )}

      {(status === 'subscribed' || status === 'disabling') && (
        <button
          type="button"
          onClick={() => void deactivate()}
          disabled={isBusy}
          aria-busy={status === 'disabling'}
          style={{
            marginTop: 12,
            border: 0,
            background: 'transparent',
            color: COLORS.danger,
            fontSize: 12.5,
            fontWeight: 700,
            cursor: isBusy ? 'wait' : 'pointer',
            padding: '7px 2px',
          }}
        >
          {status === 'disabling' ? 'Desactivando...' : 'Desactivar en este dispositivo'}
        </button>
      )}
    </aside>
  );
}
