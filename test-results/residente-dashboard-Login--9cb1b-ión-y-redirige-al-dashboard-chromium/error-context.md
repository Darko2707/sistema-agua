# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: residente-dashboard.spec.ts >> Login >> inicia sesión y redirige al dashboard
- Location: tests\e2e\residente-dashboard.spec.ts:60:7

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/residente/
Received string:  "http://localhost:3000/login"
Timeout: 10000ms

Call log:
  - Expect "toHaveURL" with timeout 10000ms
    23 × unexpected value "http://localhost:3000/login"

```

```yaml
- link "Saltar al contenido principal":
  - /url: "#main-content"
- main:
  - img "SIS4S Logo"
  - heading "Iniciar sesión" [level=1]
  - paragraph: Ingresa tus credenciales para acceder al sistema
  - text: Correo electrónico
  - textbox "Correo electrónico":
    - /placeholder: tu@correo.com
    - text: residente@test.local
  - text: Contraseña
  - textbox "Contraseña":
    - /placeholder: ••••••••
    - text: testpassword123
  - button "Mostrar clave":
    - img
  - checkbox "Recordar usuario"
  - text: Recordar usuario
  - paragraph: Guarda únicamente tu correo en este dispositivo. Nunca guardamos tu contraseña.
  - button "Ingresando..." [disabled]
  - link "¿Olvidaste tu contraseña?":
    - /url: /reset-password
  - paragraph: Pide a tu representante un código de recuperación. Caduca en 10 minutos.
  - text: ¿No tienes cuenta?
  - link "Regístrate":
    - /url: /registro
  - link "Privacidad":
    - /url: /privacidad
  - link "Cookies":
    - /url: /cookies
  - link "Términos":
    - /url: /terminos
- alert
```

# Test source

```ts
  1   | /**
  2   |  * E2E: residente dashboard — login → dashboard render → fee breakdown → payment result banner.
  3   |  *
  4   |  * Requires a seeded test account. Set env vars:
  5   |  *   E2E_RESIDENTE_EMAIL    (default: residente@test.local)
  6   |  *   E2E_RESIDENTE_PASSWORD (default: testpassword123)
  7   |  *
  8   |  * The test does NOT make real payments — it verifies the UI flow up to the
  9   |  * MercadoPago redirect and simulates the post-redirect query param.
  10  |  */
  11  | 
  12  | import { test, expect, type Page } from '@playwright/test';
  13  | import { REMEMBERED_LOGIN_EMAIL_KEY } from '../../lib/remembered-login';
  14  | 
  15  | const EMAIL    = process.env.E2E_RESIDENTE_EMAIL    ?? 'residente@test.local';
  16  | const PASSWORD = process.env.E2E_RESIDENTE_PASSWORD ?? 'testpassword123';
  17  | 
  18  | // ── helpers ──────────────────────────────────────────────────────────────────
  19  | 
  20  | async function login(page: Page) {
  21  |   await page.goto('/login');
  22  |   await page.getByLabel('Correo electrónico').fill(EMAIL);
  23  |   await page.getByLabel('Contraseña').fill(PASSWORD);
  24  |   await page.getByRole('button', { name: /iniciar sesión/i }).click();
  25  |   // Wait for redirect to /residente
> 26  |   await expect(page).toHaveURL(/\/residente/, { timeout: 10_000 });
      |                      ^ Error: expect(page).toHaveURL(expected) failed
  27  | }
  28  | 
  29  | // ── tests ─────────────────────────────────────────────────────────────────────
  30  | 
  31  | test.describe('Login', () => {
  32  |   test('precarga el usuario recordado y permite eliminarlo', async ({ page }) => {
  33  |     await page.addInitScript(
  34  |       ({ key, email }) => window.localStorage.setItem(key, email),
  35  |       { key: REMEMBERED_LOGIN_EMAIL_KEY, email: 'recordado@ejemplo.com' },
  36  |     );
  37  | 
  38  |     await page.goto('/login');
  39  | 
  40  |     await expect(page.getByLabel('Correo electrónico')).toHaveValue('recordado@ejemplo.com');
  41  |     const rememberUser = page.getByRole('checkbox', { name: 'Recordar usuario' });
  42  |     await expect(rememberUser).toBeChecked();
  43  | 
  44  |     await rememberUser.uncheck();
  45  |     await expect.poll(() => page.evaluate(
  46  |       key => window.localStorage.getItem(key),
  47  |       REMEMBERED_LOGIN_EMAIL_KEY,
  48  |     )).toBeNull();
  49  |   });
  50  | 
  51  |   test('muestra error con credenciales inválidas', async ({ page }) => {
  52  |     await page.goto('/login');
  53  |     await page.getByLabel('Correo electrónico').fill('noexiste@test.local');
  54  |     await page.getByLabel('Contraseña').fill('wrongpassword');
  55  |     await page.getByRole('button', { name: /iniciar sesión/i }).click();
  56  |     await expect(page.getByRole('alert')).toBeVisible({ timeout: 5_000 });
  57  |     await expect(page).not.toHaveURL(/\/residente/);
  58  |   });
  59  | 
  60  |   test('inicia sesión y redirige al dashboard', async ({ page }) => {
  61  |     await login(page);
  62  |     await expect(page.getByRole('heading', { name: 'Mi Cuenta de Agua' })).toBeVisible();
  63  |   });
  64  | });
  65  | 
  66  | test.describe('Dashboard de residente', () => {
  67  |   test.beforeEach(async ({ page }) => {
  68  |     await login(page);
  69  |   });
  70  | 
  71  |   test('muestra el skeleton mientras carga', async ({ page }) => {
  72  |     await page.goto('/residente');
  73  |     // The skeleton has role="status" with this aria-label while loading
  74  |     // On fast responses it may already be replaced, so we just ensure
  75  |     // the dashboard eventually renders with no crash.
  76  |     await expect(page.getByRole('heading', { name: 'Mi Cuenta de Agua' })).toBeVisible({ timeout: 10_000 });
  77  |   });
  78  | 
  79  |   test('muestra nombre y departamento del residente', async ({ page }) => {
  80  |     // Header paragraph includes name and address
  81  |     const header = page.locator('header p').first();
  82  |     await expect(header).not.toBeEmpty();
  83  |   });
  84  | 
  85  |   test('muestra el mes actual en el encabezado de la tarjeta de pago', async ({ page }) => {
  86  |     const mesActual = new Date().toLocaleDateString('es-MX', { month: 'long' });
  87  |     // Capitalize first letter to match component output
  88  |     const mesCapital = mesActual.charAt(0).toUpperCase() + mesActual.slice(1);
  89  |     await expect(page.getByRole('heading', { name: new RegExp(mesCapital) })).toBeVisible();
  90  |   });
  91  | 
  92  |   test('botón de desglose de cargos abre el panel detallado', async ({ page }) => {
  93  |     const toggleBtn = page.getByRole('button', { name: /¿Por qué el total/i });
  94  |     // Only visible when payment is pending
  95  |     const isPending = await toggleBtn.isVisible();
  96  |     if (!isPending) {
  97  |       test.skip(); // already paid this month — skip fee breakdown test
  98  |     }
  99  |     await toggleBtn.click();
  100 |     await expect(page.getByText(/Cuota mensual/i)).toBeVisible();
  101 |     await expect(page.getByText(/Comisión Mercado Pago/i)).toBeVisible();
  102 |     await expect(page.getByText(/Total a pagar/i)).toBeVisible();
  103 |     // Collapse
  104 |     await toggleBtn.click();
  105 |     await expect(page.getByText(/Cuota mensual/i)).not.toBeVisible();
  106 |   });
  107 | 
  108 |   test('botón de pago redirige a Mercado Pago', async ({ page }) => {
  109 |     const pagarBtn = page.getByRole('button', { name: /Pagar .* con Mercado Pago/i });
  110 |     const isPending = await pagarBtn.isVisible();
  111 |     if (!isPending) {
  112 |       test.skip(); // already paid — no button
  113 |     }
  114 | 
  115 |     // Intercept the checkout API call so we don't actually redirect
  116 |     await page.route('/api/mercadopago/checkout', async (route) => {
  117 |       await route.fulfill({
  118 |         status:      200,
  119 |         contentType: 'application/json',
  120 |         body:        JSON.stringify({ url: 'https://www.mercadopago.com.mx/checkout/mock' }),
  121 |       });
  122 |     });
  123 | 
  124 |     // Intercept the external redirect so the browser doesn't leave the domain
  125 |     let redirectedTo = '';
  126 |     page.on('request', (req) => {
```