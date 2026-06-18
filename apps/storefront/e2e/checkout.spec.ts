import { test, expect } from '@playwright/test';

// Unauthenticated guard — needs no API, always runs.
test('redirects unauthenticated users away from /checkout', async ({ page }) => {
  await page.goto('/checkout');
  await expect(page).toHaveURL(/\/login$/);
});

// Full checkout happy path — proxies to the live API. Skipped automatically
// unless the API is reachable (mirrors cart.spec / auth.spec skip-guard).
test('place an order: cart → checkout → confirmation, badge resets', async ({
  page,
  request,
}) => {
  const apiUrl = process.env.API_URL ?? 'http://localhost:5000';
  const apiUp = await request
    .post(`${apiUrl}/auth/login`, {
      data: { email: 'probe@none.test', password: 'x' },
      failOnStatusCode: false,
    })
    .then((r) => r.status() !== 0)
    .catch(() => false);
  test.skip(!apiUp, `API not reachable at ${apiUrl} — skipping live checkout flow`);

  const listed = await request.get(`${apiUrl}/products?status=ACTIVE&pageSize=1`);
  const firstId = (await listed.json())?.data?.[0]?.id as string | undefined;
  test.skip(!firstId, 'No ACTIVE product seeded — skipping checkout flow');

  // Register a fresh customer (auto-logs in via httpOnly cookies).
  const email = `checkout-e2e+${Date.now()}@test.com`;
  await page.goto('/register');
  await page.getByLabel(/name/i).fill('Checkout E2E');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill('password123');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/$/);

  // Add a product, then go to checkout.
  await page.goto(`/products/${firstId}`);
  await page.getByRole('button', { name: /add to cart/i }).click();
  await expect(page.getByTestId('cart-count')).toHaveText('1');

  await page.goto('/checkout');
  await page.getByLabel(/full name/i).fill('Ada Lovelace');
  await page.getByLabel(/address line 1/i).fill('12 Analytical Way');
  await page.getByLabel(/city/i).fill('London');
  await page.getByLabel(/^state/i).fill('Greater London');
  await page.getByLabel(/country/i).fill('UK');
  await page.getByLabel(/postal code/i).fill('EC1A 1BB');
  await page.getByRole('button', { name: /place order/i }).click();

  // Lands on the confirmation page.
  await expect(page).toHaveURL(/\/orders\/.+/);
  await expect(page.getByRole('heading', { name: /order placed/i })).toBeVisible();

  // Cart badge is gone (cart cleared on the server, store reset on the client).
  await expect(page.getByTestId('cart-count')).toHaveCount(0);
});
