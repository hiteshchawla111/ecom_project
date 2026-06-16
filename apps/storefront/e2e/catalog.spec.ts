import { test, expect } from '@playwright/test';

const apiUrl = process.env.API_URL ?? 'http://localhost:5000';

/** Skip live-data catalog tests when the API/seed data isn't reachable. */
async function catalogReady(request: import('@playwright/test').APIRequestContext) {
  return request
    .get(`${apiUrl}/products?pageSize=1`, { failOnStatusCode: false })
    .then(async (r) => (r.ok() ? ((await r.json()) as { total: number }) : null))
    .catch(() => null);
}

test('shop page renders the catalog and links to a product detail', async ({
  page,
  request,
}) => {
  const list = await catalogReady(request);
  test.skip(!list || list.total === 0, `No seeded catalog at ${apiUrl} — skipping`);

  await page.goto('/products');
  await expect(page.getByRole('heading', { name: /^shop$/i })).toBeVisible();

  // At least one product card links into a detail page.
  const firstCard = page.getByRole('link', { name: /.+/ }).first();
  await firstCard.click();
  await expect(page).toHaveURL(/\/products\/.+/);
  // Detail page shows an availability indicator.
  await expect(page.getByText(/in stock|unavailable/i).first()).toBeVisible();
});

test('unknown product id renders the not-found page', async ({ page, request }) => {
  const list = await catalogReady(request);
  test.skip(!list, `API not reachable at ${apiUrl} — skipping`);

  const res = await page.goto('/products/this-id-does-not-exist');
  expect(res?.status()).toBe(404);
});
