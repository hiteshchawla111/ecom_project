import { test, expect } from '@playwright/test';

// Unauthenticated guard — needs no API, always runs.
test('redirects unauthenticated users away from /cart', async ({ page }) => {
  await page.goto('/cart');
  await expect(page).toHaveURL(/\/login$/);
});

// Full cart happy path — proxies to the live API. Skipped automatically unless
// the API is reachable so the suite stays green without a backend in CI
// (mirrors auth.spec's skip-guard).
test('add a product, see it in the cart with totals, update qty, remove', async ({
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
  test.skip(!apiUp, `API not reachable at ${apiUrl} — skipping live cart flow`);

  // Need at least one ACTIVE product to add.
  const listed = await request.get(`${apiUrl}/products?status=ACTIVE&pageSize=1`);
  const firstId = (await listed.json())?.data?.[0]?.id as string | undefined;
  test.skip(!firstId, 'No ACTIVE product seeded — skipping cart flow');

  // Register a fresh customer (auto-logs in via httpOnly cookies).
  const email = `cart-e2e+${Date.now()}@test.com`;
  await page.goto('/register');
  await page.getByLabel(/name/i).fill('Cart E2E');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill('password123');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/$/);

  // Open the product and add it to the cart.
  await page.goto(`/products/${firstId}`);
  await page.getByRole('button', { name: /add to cart/i }).click();

  // Header badge reflects the item.
  await expect(page.getByTestId('cart-count')).toHaveText('1');

  // Cart page lists the line and an order summary total.
  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: /your cart/i })).toBeVisible();
  await expect(page.getByText(/total/i).first()).toBeVisible();

  // Increase quantity → still on the cart, badge updates to 2.
  await page.getByRole('button', { name: /increase quantity/i }).first().click();
  await expect(page.getByTestId('cart-count')).toHaveText('2');

  // Remove the line → empty state.
  await page.getByRole('button', { name: /^remove/i }).first().click();
  await expect(page.getByText(/your cart is empty/i)).toBeVisible();
});
