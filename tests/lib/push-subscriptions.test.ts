import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({ db: {} }));
vi.mock('@/db/schema', () => ({ pushSubscriptions: {} }));

import { isAllowedPushEndpoint } from '@/lib/push-subscriptions';

describe('isAllowedPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/device-token',
    'https://updates.push.services.mozilla.com/wpush/v2/device-token',
    'https://web.push.apple.com/QH/device-token',
    'https://notify.windows.com/?token=device-token',
    'https://db5.notify.windows.com/w/?token=device-token',
  ])('acepta el proveedor push HTTPS permitido: %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    'http://fcm.googleapis.com/fcm/send/device-token',
    'http://updates.push.services.mozilla.com/wpush/v2/device-token',
    'http://web.push.apple.com/QH/device-token',
  ])('rechaza endpoints sin HTTPS: %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });

  it.each([
    'https://usuario@fcm.googleapis.com/fcm/send/device-token',
    'https://usuario:secreto@updates.push.services.mozilla.com/wpush/v2/device-token',
  ])('rechaza endpoints con credenciales embebidas: %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });

  it.each([
    'https://fcm.googleapis.com:8443/fcm/send/device-token',
    'https://web.push.apple.com:9443/QH/device-token',
    'https://db5.notify.windows.com:444/w/?token=device-token',
  ])('rechaza endpoints con puerto no estandar: %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });

  it.each([
    'https://example.com/push/device-token',
    'https://fcm.googleapis.com.attacker.example/push',
    'https://evilnotify.windows.com/push',
    'https://notify.windows.com.attacker.example/push',
    'not-a-url',
  ])('rechaza hosts arbitrarios o URLs invalidas: %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});
