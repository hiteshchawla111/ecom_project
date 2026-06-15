import { test, expect } from '@playwright/test';

// Unauthenticated guard — needs no API, always runs.
test('redirects unauthenticated users away from /account', async ({ page }) => {
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
});

test('login page links to register and back', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: /create an account/i }).click();
  await expect(page).toHaveURL(/\/register$/);
  await page.getByRole('link', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/login$/);
});

// Full happy path — proxies to the live API. Skipped automatically unless the
// API is reachable so the suite stays green without a backend in CI.
test('register, land home, view account, then log out', async ({ page, request }) => {
  const apiUrl = process.env.API_URL ?? 'http://localhost:5000';
  const apiUp = await request
    .post(`${apiUrl}/auth/login`, {
      data: { email: 'probe@none.test', password: 'x' },
      failOnStatusCode: false,
    })
    .then((r) => r.status() !== 0)
    .catch(() => false);
  test.skip(!apiUp, `API not reachable at ${apiUrl} — skipping live auth flow`);

  const email = `e2e+${Date.now()}@test.com`;

  await page.goto('/register');
  await page.getByLabel(/name/i).fill('E2E User');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill('password123');
  await page.getByRole('button', { name: /create account/i }).click();

  // Lands on home after registration.
  await expect(page).toHaveURL(/\/$/);

  // Protected account page now resolves the session.
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: /my account/i })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  // Log out, then the account route bounces back to login.
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login$/);
});
