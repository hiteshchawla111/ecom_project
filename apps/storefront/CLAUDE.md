# CLAUDE.md — Storefront (`apps/storefront`)

Customer-facing e-commerce site. Imported by the root `CLAUDE.md`. Read the root for monorepo-wide product, roles, architecture, and conventions; this file covers storefront specifics only.

## Stack

- **Next.js (App Router) + TypeScript** — SSR/RSC for SEO-sensitive catalog and product pages.
- **Tailwind CSS** — theme mapped to `DESIGN.md` tokens (warm/coral palette). No hardcoded hex.
- Consumes `apps/api` for all data and customer auth.

## Status

Not yet scaffolded. Planned scaffold: `create-next-app` (TS, App Router, Tailwind, ESLint).

## Commands (aspirational — verify once scaffolded)

```bash
npm run dev      # local dev
npm run build    # production build
npm run lint     # eslint
npm test         # unit tests; single: npm test -- <pattern>
```

## Scope (PRD — customer features)

- **Auth:** registration, login, logout, password reset, profile management.
- **Discovery:** search, filter, sort products; browse hierarchical categories. SSR these for SEO.
- **Product detail:** images, description, pricing (regular + sale), availability, related products.
- **Cart:** add/remove/update quantities, view totals, persist cart state.
- **Checkout:** collect shipping info (name, address, city, state, country, postal code), order review (products, quantities, pricing, taxes, shipping, final amount), then place order. **No payment processing** — placing = creating the order.
- **Orders:** order history, order details, order status tracking.
- **Notifications (display/consume):** registration confirmation, order confirmation, shipping/delivery updates.

## Storefront-specific guidance

- **Server-render** catalog, category, and product pages (SEO + fast first paint); cart/checkout can be client-interactive.
- **Never compute prices/totals client-side** — render what the API returns. The API owns the cart/total pipeline.
- Persist cart state per the PRD (server-backed cart for logged-in users; decide guest-cart strategy at build time).
- Accessibility is a hard requirement: semantic HTML, keyboard nav, focus states, WCAG-AA contrast (see `DESIGN.md`).
- Order-status colors come from the semantic token mapping in `DESIGN.md`.
