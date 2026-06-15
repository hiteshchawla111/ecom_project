# Frontend Test Runners Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up Vitest+RTL in `apps/admin`, Vitest+RTL in `apps/storefront`, and Playwright E2E in `apps/storefront`, each proven by one passing smoke test.

**Architecture:** Admin reuses its existing `vite.config.ts` (add a `test` block). Storefront gets a standalone `vitest.config.ts` (Next has no Vite config) plus a separate `playwright.config.ts`. Vitest owns `src/**/*.test.tsx`; Playwright owns `e2e/**/*.spec.ts` — distinct dir + extension, no overlap.

**Tech Stack:** Vitest, @testing-library/react + jest-dom + user-event, jsdom, @vitest/coverage-v8, @playwright/test. Vite 8 / React 19 (admin), Next 16 / React 19 (storefront).

**Spec:** `docs/superpowers/specs/2026-06-15-frontend-test-runners-design.md`

**Conventions**
- Shell cwd resets between calls — use `npm --prefix apps/<app> ...` for npm; for Playwright/vitest binaries that need app cwd, run as a compound `cd apps/<app> && npx ...`.
- Unit tests are co-located `*.test.tsx`. E2E tests are `apps/storefront/e2e/*.spec.ts`.
- Don't commit secrets. **After each task: update PLAN.md if its checkbox is in scope, then STOP for user verification (RULE.md §1).** This plan groups into 2 features: (A) admin runner, (B) storefront runners. Stop after each.

**Verified facts (from reading the code):**
- `apps/admin/src/App.tsx` renders an `<h1>` with text **"Admin Dashboard"** — smoke assertion target.
- `apps/storefront/src/app/page.tsx` default-exports a **synchronous** `Home` component (no `async`/server-only APIs) with an `<h1>` reading **"To get started, edit the page.tsx file."** — renders under jsdom via RTL; `next/image` becomes an `<img>`.
- `apps/admin/tsconfig.app.json` has `"types": ["vite/client"]` (EXTEND this array, do not replace) and `verbatimModuleSyntax: true`.
- `apps/storefront/.gitignore` already ignores `/coverage`.

---

## File Structure

**apps/admin** — modify: `package.json`, `vite.config.ts`, `tsconfig.app.json`, `CLAUDE.md`. create: `src/test/setup.ts`, `src/App.test.tsx`.

**apps/storefront** — modify: `package.json`, `.gitignore`, `CLAUDE.md`. create: `vitest.config.ts`, `src/test/setup.ts`, `src/app/page.test.tsx`, `playwright.config.ts`, `e2e/home.spec.ts`.

**root** — modify: `PLAN.md`.

---

# FEATURE A — Admin Vitest + RTL

## Task A1: Install admin test deps

**Files:** modify `apps/admin/package.json` (via npm)

- [ ] **Step 1: Install**
```bash
npm --prefix apps/admin install -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```
Expected: installs succeed.

- [ ] **Step 2: Commit** (config/tests come in A2, but lock the deps first)
```bash
git add apps/admin/package.json apps/admin/package-lock.json
git commit -m "chore(admin): add Vitest + RTL test dependencies"
```

## Task A2: Configure Vitest, add setup + smoke test, scripts

**Files:** modify `apps/admin/vite.config.ts`, `apps/admin/tsconfig.app.json`, `apps/admin/package.json`; create `apps/admin/src/test/setup.ts`, `apps/admin/src/App.test.tsx`

- [ ] **Step 1: Replace `apps/admin/vite.config.ts` with:**
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: { provider: 'v8' },
  },
});
```

- [ ] **Step 2: Create `apps/admin/src/test/setup.ts`:**
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Extend the `types` array in `apps/admin/tsconfig.app.json`** — change `"types": ["vite/client"]` to:
```json
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"],
```
(Keep every other field unchanged.)

- [ ] **Step 4: Add scripts to `apps/admin/package.json`** — add to the `"scripts"` object:
```json
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage"
```

- [ ] **Step 5: Create the smoke test `apps/admin/src/App.test.tsx`:**
```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the admin dashboard heading', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /admin dashboard/i }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the test — expect PASS (1 test)**
```bash
npm --prefix apps/admin test
```
Expected: 1 passed. If `verbatimModuleSyntax` causes a type-only import error on `vitest`/RTL, the imports above are runtime values (render/screen/describe) so this should not trigger; if it does, report it — do not add `any`.

- [ ] **Step 7: Confirm build + lint still clean**
```bash
npm --prefix apps/admin run build
npm --prefix apps/admin run lint
```
Expected: both succeed. NOTE: `tsc -b` in build will now typecheck the test file; if it complains the `.test.tsx` should be excluded from the app build, add `"src/**/*.test.{ts,tsx}"` and `"src/test"` to an `exclude` in `tsconfig.app.json` and re-run — report if you do this.

- [ ] **Step 8: Commit**
```bash
git add apps/admin/vite.config.ts apps/admin/tsconfig.app.json apps/admin/package.json apps/admin/src/test/setup.ts apps/admin/src/App.test.tsx
git commit -m "test(admin): wire Vitest + RTL with a smoke test"
```

## Task A3: Update admin CLAUDE.md commands

**Files:** modify `apps/admin/CLAUDE.md`

- [ ] **Step 1:** In the "Commands (aspirational — verify once scaffolded)" block, replace the `npm test` line and add coverage:
```bash
npm test          # vitest run (unit/component)
npm run test:watch # vitest watch mode
npm run test:cov   # vitest run --coverage
```
Keep the surrounding lines (`dev`, `build`, `preview`, `lint`). Optionally drop the word "aspirational" from the heading since test commands are now real.

- [ ] **Step 2: Commit**
```bash
git add apps/admin/CLAUDE.md
git commit -m "docs(admin): document real Vitest commands"
```

- [ ] **Step 3: STOP — Feature A complete. Ask the user to verify the admin runner before starting Feature B.**

---

# FEATURE B — Storefront Vitest + RTL and Playwright

## Task B1: Install storefront unit-test deps

**Files:** modify `apps/storefront/package.json`

- [ ] **Step 1: Install** (storefront lacks `@vitejs/plugin-react`, so include it)
```bash
npm --prefix apps/storefront install -D vitest @vitest/coverage-v8 jsdom @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Commit**
```bash
git add apps/storefront/package.json apps/storefront/package-lock.json
git commit -m "chore(storefront): add Vitest + RTL test dependencies"
```

## Task B2: Configure storefront Vitest + setup + smoke test + scripts

**Files:** create `apps/storefront/vitest.config.ts`, `apps/storefront/src/test/setup.ts`, `apps/storefront/src/app/page.test.tsx`; modify `apps/storefront/package.json`

- [ ] **Step 1: Create `apps/storefront/vitest.config.ts`:**
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: { provider: 'v8' },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

- [ ] **Step 2: Create `apps/storefront/src/test/setup.ts`:**
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Add scripts to `apps/storefront/package.json`** — add to `"scripts"`:
```json
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage",
    "test:e2e": "playwright test"
```

- [ ] **Step 4: Create the smoke test `apps/storefront/src/app/page.test.tsx`:**
```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Home from './page';

describe('Home page', () => {
  it('renders the getting-started heading', () => {
    render(<Home />);
    expect(
      screen.getByRole('heading', { name: /to get started, edit the page\.tsx file/i }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run — expect PASS (1 test)**
```bash
npm --prefix apps/storefront test
```
Expected: 1 passed. If `next/image` fails to render under jsdom (it should render as an `<img>` and be fine), report the exact error — do NOT mock it away unless necessary; if a mock is genuinely required, add a minimal `vi.mock('next/image', ...)` returning a plain `img` and note it.

- [ ] **Step 6: Confirm build + lint clean**
```bash
npm --prefix apps/storefront run build
npm --prefix apps/storefront run lint
```
Expected: both succeed. The Next build ignores `vitest.config.ts` and test files by default; if lint flags the test file, ensure the storefront eslint config doesn't error on vitest globals (globals come from the `vitest/globals` types; if eslint complains about undefined globals, report it).

- [ ] **Step 7: Commit**
```bash
git add apps/storefront/vitest.config.ts apps/storefront/src/test/setup.ts apps/storefront/src/app/page.test.tsx apps/storefront/package.json
git commit -m "test(storefront): wire Vitest + RTL with a smoke test"
```

## Task B3: Configure Playwright E2E + smoke test + gitignore

**Files:** create `apps/storefront/playwright.config.ts`, `apps/storefront/e2e/home.spec.ts`; modify `apps/storefront/.gitignore`, `apps/storefront/package.json` (dep)

- [ ] **Step 1: Install Playwright**
```bash
npm --prefix apps/storefront install -D @playwright/test
```

- [ ] **Step 2: Install the browser binary (Chromium is enough for a smoke test)**
```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/storefront && npx playwright install chromium
```
Expected: Chromium downloads. (This may take a minute.)

- [ ] **Step 3: Create `apps/storefront/playwright.config.ts`:**
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

- [ ] **Step 4: Create `apps/storefront/e2e/home.spec.ts`:**
```ts
import { test, expect } from '@playwright/test';

test('home page loads', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /to get started, edit the page\.tsx file/i }),
  ).toBeVisible();
});
```

- [ ] **Step 5: Add Playwright artifacts to `apps/storefront/.gitignore`** — append:
```
# playwright
/test-results
/playwright-report
/playwright/.cache
```

- [ ] **Step 6: Run E2E — expect PASS (1 test)**
```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/storefront && npx playwright test
```
Expected: Playwright starts `next dev`, navigates, 1 passed. If the dev server is slow to boot, the 120s timeout covers it. Report the result.

- [ ] **Step 7: Confirm Vitest still ignores the e2e dir** (regression check on runner separation)
```bash
npm --prefix apps/storefront test
```
Expected: still 1 passed (the e2e `*.spec.ts` is NOT picked up by Vitest).

- [ ] **Step 8: Commit**
```bash
git add apps/storefront/playwright.config.ts apps/storefront/e2e/home.spec.ts apps/storefront/.gitignore apps/storefront/package.json apps/storefront/package-lock.json
git commit -m "test(storefront): wire Playwright E2E with a smoke test"
```

## Task B4: Update storefront CLAUDE.md + PLAN.md, final verify

**Files:** modify `apps/storefront/CLAUDE.md`, `PLAN.md`

- [ ] **Step 1: Update `apps/storefront/CLAUDE.md`** "Commands" block — replace the `npm test` line and add:
```bash
npm test           # vitest run (unit/component)
npm run test:cov   # vitest run --coverage
npm run test:e2e   # playwright e2e (auto-starts dev server)
```
Keep `dev`/`build`/`lint`. Optionally drop "aspirational".

- [ ] **Step 2: Update `PLAN.md`:**
  - Phase 0 checkbox — flip the test-runners line to done:
    `- [x] Set up test runners per app — Jest in api ✅; Vitest + RTL for admin/storefront ✅; Playwright E2E for storefront ✅.`
  - In the **App status** table, update storefront/admin notes to mention test runners wired.
  - In the **Phase status** table, Phase 0 — drop the "FE test runners pending" caveat (only ESLint/Prettier polish remains, if anything): set to e.g. `🟡 In Progress (apps scaffold ✅; test runners ✅)` or `✅ Done` if you judge ESLint/Prettier already adequate per scaffold. Pick the accurate one and note it.
  - Update the "Open gap (from Phase 0)" note in the gotchas section to say FE test runners are now wired (Vitest+RTL + Playwright), so the TDD hook scope can include them.

- [ ] **Step 3: Final cross-app verification (per RULE.md §5)**
```bash
npm --prefix apps/admin test
npm --prefix apps/storefront test
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/storefront && npx playwright test
```
Expected: admin 1 passed, storefront 1 passed, e2e 1 passed.

- [ ] **Step 4: Commit**
```bash
git add apps/storefront/CLAUDE.md PLAN.md
git commit -m "docs: document storefront test commands; mark Phase 0 test runners done"
```

- [ ] **Step 5: STOP — Feature B complete. Ask the user to verify before any further work.**

---

## Self-Review notes

- **Spec coverage:** admin Vitest+RTL (A1–A2), storefront Vitest+RTL (B1–B2), storefront Playwright (B3), coverage tooling (`@vitest/coverage-v8` + `test:cov` in A1/A2/B1/B2), co-located `*.test.tsx` (A2/B2), `e2e/*.spec.ts` separation + Vitest `exclude` (B2/B3), webServer auto-start (B3), gitignore artifacts (B3), PLAN.md + both CLAUDE.md updates (A3/B4). All spec sections map to a task.
- **Runner separation** is verified twice: Vitest `exclude: ['e2e/**']` (B2 Step 1) and an explicit regression check that Vitest still finds only 1 test after the e2e file exists (B3 Step 7).
- **Smoke assertions target real, verified text** ("Admin Dashboard"; "To get started, edit the page.tsx file.") — not placeholders.
- **Known risk flagged inline:** `tsc -b` in admin's build typechecking test files (A2 Step 7) and `next/image` under jsdom (B2 Step 5) — each has a concrete fallback instruction without resorting to `any`.
- **Type consistency:** setup files identical in both apps; script names (`test`/`test:watch`/`test:cov`/`test:e2e`) consistent; config `include`/`exclude` globs match between Vitest config and the test file locations.
