import { test, expect, type Page } from '@playwright/test';

const RESIDENT_EMAIL = process.env.E2E_RESIDENTE_EMAIL ?? 'residente@test.local';
const PASSWORD = process.env.E2E_RESIDENTE_PASSWORD ?? process.env.E2E_TEST_PASSWORD ?? 'Sisco-E2E-2026!';

async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
}

test.describe('HU-S4-05: Concepto visible Mantenimiento de bomba', () => {
  test('muestra «Mantenimiento de bomba» en el dashboard del residente', async ({ page }) => {
    await loginAs(page, RESIDENT_EMAIL);
    await expect(page).toHaveURL(/\/residente(?:\?.*)?$/, { timeout: 20_000 });

    // La tarjeta de servicio debe llamarse "Mantenimiento de bomba" y no "Agua" ni "Agua potable"
    await expect(page.getByRole('heading', { name: 'Mantenimiento de bomba' })).toBeVisible({ timeout: 10_000 });
  });

  test('muestra «Mantenimiento de bomba» en el resumen de desglose', async ({ page }) => {
    await loginAs(page, RESIDENT_EMAIL);
    await expect(page).toHaveURL(/\/residente(?:\?.*)?$/, { timeout: 20_000 });

    // Verificamos que el resumen de cobro contenga el texto Mantenimiento de bomba
    await expect(page.getByText(/Mantenimiento de bomba/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('HU-S4-01: Control de sesión única', () => {
  test('notifica claramente cuando la sesión fue invalidada por otro dispositivo', async ({ page }) => {
    // Al navegar a /login con motivo=otro_dispositivo
    await page.goto('/login?motivo=otro_dispositivo');

    // Debe mostrar banner visible de alerta
    const alerta = page.getByRole('alert').filter({ hasText: /Tu sesión se cerró porque se inició sesión en otro dispositivo/i });
    await expect(alerta).toBeVisible({ timeout: 5_000 });
    await expect(alerta).toContainText(/Tu sesión se cerró porque se inició sesión en otro dispositivo/i);
  });
});

test.describe('HU-S4-04: Visualización de evidencias fotográficas', () => {
  test('el panel de representante incluye la pestaña de evidencias de la cuadrilla', async ({ page }) => {
    await loginAs(page, 'representante@test.local');
    await expect(page).toHaveURL(/\/representante(?:\?.*)?$/, { timeout: 20_000 });

    const tabEvidencias = page.getByRole('button', { name: /Evidencias cuadrilla/i });
    await expect(tabEvidencias).toBeVisible({ timeout: 10_000 });
    await tabEvidencias.click();
    await expect(page.getByText(/Evidencias fotográficas de la cuadrilla/i)).toBeVisible();
  });
});
