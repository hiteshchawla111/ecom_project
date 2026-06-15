# Frontend Test Runners — Design

**Date:** 2026-06-15
**Status:** Approved — ready for implementation plan
**Scope:** `apps/admin` and `apps/storefront`. Closes the open Phase 0 gap so Phase 2 frontend auth can be built test-first (RULE.md §4).

Derived from `PLAN.md` Phase 0 ("Set up test runners per app — Vitest + RTL for `admin`/`storefront` and Playwright for storefront E2E still pending") and the per-app `CLAUDE.md` files.

---

## Goal

Stand up working test pipelines in both frontends, each proven by one smoke test:
- `apps/admin`: Vitest + React Testing Library (unit/component).
- `apps/storefront`: Vitest + RTL (unit/component) **and** Playwright (E2E).

The runners are the deliverable. No real component/auth tests yet — those land with Phase 2 frontend work.

## Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Scope | All three runners (admin Vitest, storefront Vitest, storefront Playwright) |
| Example tests | One minimal smoke test per runner |
| Unit test location | Co-located `*.test.tsx` next to source (consistent with API's co-located `*.spec.ts`) |
| E2E location/naming | `apps/storefront/e2e/*.spec.ts` (distinct dir AND extension from Vitest's `*.test.tsx`) |
| Playwright server | `webServer` auto-starts `next dev`, `reuseExistingServer: true` |
| Coverage | Add `@vitest/coverage-v8` + `test:cov` script now in both apps |

## Stack facts (verified)

- `apps/admin`: Vite 8 + React 19 + Tailwind 4, has `vite.config.ts`, split tsconfig (`tsconfig.app.json` / `tsconfig.node.json`).
- `apps/storefront`: Next.js 16 (App Router) + React 19 + Tailwind 4, no Vite config (needs a standalone `vitest.config.ts`), path alias `@/* -> ./src/*`.
- Neither app has any test runner today.

## Architecture

### Admin (`apps/admin`) — Vitest + RTL

- **Dev deps:** `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `@vitest/coverage-v8`.
- **Config:** extend the existing `vite.config.ts` with a `test` block (Vitest reuses Vite's React + Tailwind transform). Add `/// <reference types="vitest/config" />` at the top.
  ```ts
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: { provider: 'v8' },
  }
  ```
- **Setup file** `src/test/setup.ts`: `import '@testing-library/jest-dom/vitest';`
- **TS:** add `"types": ["vitest/globals", "@testing-library/jest-dom"]` to `tsconfig.app.json` compilerOptions so globals + matchers typecheck.
- **Scripts:** `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:cov": "vitest run --coverage"`.
- **Smoke test** `src/App.test.tsx`: render `<App />`, assert a known existing element/text is in the document.

### Storefront (`apps/storefront`) — Vitest + RTL

- **Dev deps:** same set as admin, plus `@vitejs/plugin-react` (admin already has it; storefront does not).
- **Config:** new `vitest.config.ts` (Next has no Vite config to extend):
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
- **Setup file** `src/test/setup.ts`: `import '@testing-library/jest-dom/vitest';`
- **TS:** add `vitest.config.ts` to the tsconfig include if needed; add test global types via a `types` entry or a triple-slash reference in the setup file.
- **Scripts:** `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:cov": "vitest run --coverage"`, plus the Playwright script below.
- **Smoke test** `src/app/page.test.tsx`: render the home page's renderable content and assert visible text. If the App Router `page.tsx` is a server component that cannot render under jsdom, the smoke test instead renders a trivial client leaf to prove the pipeline — the runner being proven is what matters, not coupling to a page that will change.

### Storefront — Playwright (E2E)

- **Dev dep:** `@playwright/test`. Browsers installed via `npx playwright install` (explicit plan step).
- **Config** `playwright.config.ts`:
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
- **Script:** `"test:e2e": "playwright test"`.
- **Smoke test** `e2e/home.spec.ts`: `await page.goto('/')`, assert the page responds and a heading/title is visible.
- **.gitignore:** add `/test-results`, `/playwright-report`, `/playwright/.cache` to `apps/storefront/.gitignore`.

## Runner separation (key correctness concern)

- Vitest `include` matches **`src/**/*.test.{ts,tsx}`** and explicitly **excludes `e2e/**`**.
- Playwright `testDir` is **`./e2e`** and its files are **`*.spec.ts`**.
- Distinct directories AND extensions → neither runner ever picks up the other's files.

## Verification (per RULE.md §5 — smoke-run the real thing)

- `npm --prefix apps/admin test` → smoke test passes.
- `npm --prefix apps/storefront test` → smoke test passes.
- `npm --prefix apps/storefront run test:e2e` → Playwright smoke passes (after `playwright install`).
- `npm --prefix apps/admin run build` and `npm --prefix apps/storefront run build` still succeed; lint still clean.

## Docs to update

- `PLAN.md`: tick the Phase 0 "Set up test runners per app" checkbox; update Phase 0 status line (this was the last pending foundation item alongside ESLint/Prettier polish).
- `apps/admin/CLAUDE.md` and `apps/storefront/CLAUDE.md`: update the "Commands (aspirational)" test lines to reflect the now-real `test` / `test:cov` / `test:e2e` commands.

## Out of scope

Real component/auth tests, CI wiring, MSW or API-mocking layer (added when auth tests need it), visual regression, component story tooling.
