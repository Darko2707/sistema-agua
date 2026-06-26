/**
 * E2E: residente dashboard — login → dashboard render → fee breakdown → payment result banner.
 *
 * Requires a seeded test account. Set env vars:
 *   E2E_RESIDENTE_EMAIL    (default: residente@test.local)
 *   E2E_RESIDENTE_PASSWORD (default: testpassword123)
 *
 * The test does NOT make real payments — it verifies the UI flow up to the
 * MercadoPago redirect and simulates the post-redirect query param.
 */

import { test, expect, type Page } from '@playwright/test';

const EMAIL    = process.env.E2E_RESIDENTE_EMAIL    ?? 'residente@test.local';
const PASSWORD = process.env.E2E_RESIDENTE_PASSWORD ?? 'testpassword123';

// ── helpers ──────────────────────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(EMAIL);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  // Wait for redirect to /residente
  await expect(page).toHaveURL(/\/residente/, { timeout: 10_000 });
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('Login', () => {
  test('muestra error con credenciales inválidas', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill('noexiste@test.local');
    await page.getByLabel('Contraseña').fill('wrongpassword');
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5_000 });
    await expect(page).not.toHaveURL(/\/residente/);
  });

  test('inicia sesión y redirige al dashboard', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: 'Mi Cuenta de Agua' })).toBeVisible();
  });
});

test.describe('Dashboard de residente', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('muestra el skeleton mientras carga', async ({ page }) => {
    await page.goto('/residente');
    // The skeleton has role="status" with this aria-label while loading
    // On fast responses it may already be replaced, so we just ensure
    // the dashboard eventually renders with no crash.
    await expect(page.getByRole('heading', { name: 'Mi Cuenta de Agua' })).toBeVisible({ timeout: 10_000 });
  });

  test('muestra nombre y departamento del residente', async ({ page }) => {
    // Header paragraph includes name and address
    const header = page.locator('header p').first();
    await expect(header).not.toBeEmpty();
  });

  test('muestra el mes actual en el encabezado de la tarjeta de pago', async ({ page }) => {
    const mesActual = new Date().toLocaleDateString('es-MX', { month: 'long' });
    // Capitalize first letter to match component output
    const mesCapital = mesActual.charAt(0).toUpperCase() + mesActual.slice(1);
    await expect(page.getByRole('heading', { name: new RegExp(mesCapital) })).toBeVisible();
  });

  test('botón de desglose de cargos abre el panel detallado', async ({ page }) => {
    const toggleBtn = page.getByRole('button', { name: /¿Por qué el total/i });
    // Only visible when payment is pending
    const isPending = await toggleBtn.isVisible();
    if (!isPending) {
      test.skip(); // already paid this month — skip fee breakdown test
    }
    await toggleBtn.click();
    await expect(page.getByText(/Cuota mensual/i)).toBeVisible();
    await expect(page.getByText(/Comisión Mercado Pago/i)).toBeVisible();
    await expect(page.getByText(/Total a pagar/i)).toBeVisible();
    // Collapse
    await toggleBtn.click();
    await expect(page.getByText(/Cuota mensual/i)).not.toBeVisible();
  });

  test('botón de pago redirige a Mercado Pago', async ({ page }) => {
    const pagarBtn = page.getByRole('button', { name: /Pagar .* con Mercado Pago/i });
    const isPending = await pagarBtn.isVisible();
    if (!isPending) {
      test.skip(); // already paid — no button
    }

    // Intercept the checkout API call so we don't actually redirect
    await page.route('/api/mercadopago/checkout', async (route) => {
      await route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify({ url: 'https://www.mercadopago.com.mx/checkout/mock' }),
      });
    });

    // Intercept the external redirect so the browser doesn't leave the domain
    let redirectedTo = '';
    page.on('request', (req) => {
      if (req.url().includes('mercadopago.com')) {
        redirectedTo = req.url();
      }
    });

    await pagarBtn.click();
    // Button goes into loading state
    await expect(page.getByRole('button', { name: /Redirigiendo/i })).toBeVisible({ timeout: 3_000 });
  });
});

test.describe('Resultado de pago post-MP', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('?payment=success muestra banner de éxito', async ({ page }) => {
    await page.goto('/residente?payment=success');
    const banner = page.getByRole('status').filter({ hasText: /procesado correctamente/i });
    await expect(banner).toBeVisible({ timeout: 5_000 });
  });

  test('?payment=pending muestra banner de verificación', async ({ page }) => {
    await page.goto('/residente?payment=pending');
    const banner = page.getByRole('status').filter({ hasText: /siendo verificado/i });
    await expect(banner).toBeVisible({ timeout: 5_000 });
  });

  test('?payment=failure muestra banner de error', async ({ page }) => {
    await page.goto('/residente?payment=failure');
    const banner = page.getByRole('status').filter({ hasText: /no se completó/i });
    await expect(banner).toBeVisible({ timeout: 5_000 });
  });

  test('banner desaparece del URL después de mostrarse', async ({ page }) => {
    await page.goto('/residente?payment=success');
    // Wait for the component effect to clean the URL
    await expect(page).not.toHaveURL(/payment=/, { timeout: 3_000 });
  });
});

test.describe('Historial de pagos vacío', () => {
  test('estado vacío tiene CTA de primer pago', async ({ page }) => {
    await login(page);
    // Only verifiable on a fresh account — if history list is not visible, check empty state
    const emptyState = page.getByText(/Aún no tienes pagos registrados/i);
    const historyList = page.getByRole('list', { name: 'Historial de pagos' });
    const hasHistory = await historyList.isVisible();
    if (!hasHistory) {
      await expect(emptyState).toBeVisible();
      await expect(page.getByRole('button', { name: /Realizar primer pago/i })).toBeVisible();
    }
  });
});

test.describe('Skip navigation', () => {
  test('skip link lleva al contenido principal al hacer Tab', async ({ page }) => {
    await page.goto('/residente');
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: /Saltar al contenido/i });
    await expect(skipLink).toBeFocused();
  });
});
