# Storefront UI Redesign — Implementation Plan

**Branch:** `worktree-ui-ux-pro` · **Scope:** `apps/storefront` only (customer-facing) · Admin deferred.
**Direction:** *Refined Retail* — Swiss-modernist editorial e-commerce. Excellent perf, WCAG AAA-leaning.
**Motion:** GSAP (scroll-reveal, staggered grid, hero), `prefers-reduced-motion` gated.

## Hard constraint (non-negotiable)
**Presentational changes only.** No change to any API call, route handler (`src/app/api/**`),
`lib/**` data/auth logic, fetch logic, response handling, component **props**, **handlers**, or
**test-ids**. Server/client (`'use client'`) boundaries preserved. Only markup, Tailwind classes,
tokens, fonts, and motion change. (Per memory: `ui-redesign-presentational-only`.)

## Visual language
- **Grid:** strict max-w-7xl, 12-col rhythm, generous whitespace (8px base scale).
- **Type:** keep Inter (body) + Plus Jakarta (heading) — no new font dep. Display headings go
  oversized with tight tracking (`clamp()`); confident hierarchy.
- **Color:** keep the coral/teal OKLCH token system + dark mode + runtime brand-hue. Elevate, don't replace.
- **Depth:** existing warm shadow scale; refined borders; restrained accent use.
- **Components:** shadcn-style interaction states where they slot in; SVG icons only (no emoji).

## Token layer (additive, shared)
`packages/design-tokens/theme.css` — add (no removals):
- Display type-scale tokens / fluid clamps if needed.
- Motion tokens (durations/eases) so JS + CSS share one rhythm.
- Verify dark-mode contrast for any new surface.

## Build order (each step = a STOP-and-verify task per RULE.md §1)

1. **Foundation:** GSAP install + a reduced-motion-safe `useReveal`/`useStagger` hook + token additions. *(no visual change yet; sets up motion)*
2. **Layout chrome:** SiteHeaderView, SiteFooter, MobileNav, ThemeToggle.
3. **Home:** Hero (animated), New-arrivals grid (staggered), CategoryShortcuts.
4. **Catalog primitives:** ProductCard, Price, RatingStars, sale ribbon. *(highest-repetition unit)*
5. **Catalog pages:** /products (filters, facets, grid, pagination), /categories, /categories/[slug].
6. **Product detail:** /products/[id] (gallery, info, related, seller link).
7. **Cart + Checkout:** /cart, /checkout (forms, order summary, validation states).
8. **Account / Orders / Auth:** /account, /orders, /orders/[id], (auth) login/register/forgot/reset.
9. **Seller storefront:** /sell, /seller/[slug], /account/seller.

> After **each** numbered task: run `npm run lint` + `npm test` (storefront), confirm no prop/test
> breakage, smoke in browser, then STOP for user verification before the next.

## Verification per task
- `npm run lint` clean.
- `npm test` (vitest) green — existing component tests assert structure/test-ids; they are the
  guardrail proving I didn't break the contract.
- `npm run build` (catches client/server import leaks — per memory `storefront-server-only-client-leak`).
- Browser smoke at 375 / 768 / 1024 / 1440 + dark mode + reduced-motion.

## Risks
- Existing tests may assert exact class strings / structure → adjust test expectations only where
  they assert *presentation*, never where they assert behavior/test-ids. Flag each such change.
- GSAP + Next SSR: animations run client-side only via a `'use client'` motion hook; SSR markup
  stays the source of truth (no layout shift, content visible without JS).
