import { expect, test } from '@playwright/test';

test('forgot-password page renders', async ({ page }) => {
  await page.goto('/forgot-password');
  await expect(
    page.getByRole('heading', { name: /reset your password/i }),
  ).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(
    page.getByRole('button', { name: /send reset link/i }),
  ).toBeVisible();
});

// Submitting proxies to the live API. Skipped automatically unless the API is
// reachable so the suite stays green without a backend in CI (mirrors auth.spec).
test('submitting the reset request redirects to login', async ({
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
  test.skip(!apiUp, `API not reachable at ${apiUrl} — skipping live reset flow`);

  await page.goto('/forgot-password');
  await page.getByLabel(/email/i).fill('nobody@example.com');
  await page.getByRole('button', { name: /send reset link/i }).click();

  await expect(page).toHaveURL(/\/login$/);
});

test('reset-password with no token shows the invalid-link message', async ({
  page,
}) => {
  await page.goto('/reset-password');
  await expect(page.getByRole('alert')).toContainText(/invalid or expired/i);
  await expect(
    page.getByRole('link', { name: /request a new link/i }),
  ).toBeVisible();
});
