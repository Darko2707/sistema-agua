/* global self */
'use strict';

const DEFAULT_TITLE = 'SIS4S Agua';
const DEFAULT_BODY = 'Tienes una actualización en tu cuenta de agua.';
const DEFAULT_PATH = '/residente';
const ICON_PATH = '/logo1SIS4S.png';
const ALLOWED_PATHS = new Set(['/residente', '/residente/folios']);

function cleanText(value, fallback, maxLength) {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
}

function safeResidentPath(value) {
  if (typeof value !== 'string') return DEFAULT_PATH;

  try {
    const url = new URL(value, self.location.origin);
    const belongsToThisApp = url.origin === self.location.origin;
    const isResidentRoute = ALLOWED_PATHS.has(url.pathname);

    if (!belongsToThisApp || !isResidentRoute) return DEFAULT_PATH;
    // El servidor decide el destino permitido. Ignoramos parámetros para que una
    // notificación no pueda simular estados visuales controlados por la URL.
    return url.pathname;
  } catch {
    return DEFAULT_PATH;
  }
}

function readPayload(event) {
  if (!event.data) return {};

  try {
    const value = event.data.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return { body: event.data.text() };
  }
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event);
  const title = cleanText(payload.title, DEFAULT_TITLE, 80);
  const body = cleanText(payload.body, DEFAULT_BODY, 180);
  const path = safeResidentPath(payload.url);
  const tag = cleanText(payload.tag, 'sis4s-actualizacion', 80);

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: ICON_PATH,
    tag,
    renotify: false,
    data: { path },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = safeResidentPath(event.notification.data?.path);
  const targetUrl = new URL(path, self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    const existingWindow = windows.find((client) => {
      try {
        return new URL(client.url).origin === self.location.origin;
      } catch {
        return false;
      }
    });

    if (existingWindow) {
      if ('navigate' in existingWindow) await existingWindow.navigate(targetUrl);
      return existingWindow.focus();
    }

    return self.clients.openWindow(targetUrl);
  })());
});
