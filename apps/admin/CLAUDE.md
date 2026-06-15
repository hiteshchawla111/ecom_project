# CLAUDE.md — Admin (`apps/admin`)

Internal admin & inventory dashboard. Imported by the root `CLAUDE.md`. Read the root for monorepo-wide product, roles, architecture, and conventions; this file covers admin specifics only.

## Stack

- **React + Vite + TypeScript** — internal SPA (no SEO needs, highly interactive).
- **Tailwind CSS** — same `DESIGN.md` tokens as the storefront, so both UIs share one palette.
- Consumes `apps/api`. Used by **Admin** and **Inventory Manager** roles only.

## Status

Not yet scaffolded. Planned scaffold: Vite `react-ts` template + Tailwind.

## Commands

```bash
npm run dev        # vite dev server — fixed port :5002 (strictPort)
npm run build      # production build (tsc + vite build)
npm run preview    # preview prod build (also :5002)
npm run lint       # eslint
npm test           # vitest run (unit/component); single: npm test -- <pattern>
npm run test:watch # vitest watch mode
npm run test:cov   # vitest run --coverage
```

## Scope (PRD — admin + inventory features)

**Admin**
- **Products:** create, update, archive, activate/deactivate. Fields: name, SKU, description, price, sale price, images, category, brand, stock quantity, status.
- **Categories:** create, update, delete, organize hierarchically.
- **Orders:** view orders, update status (within the valid state machine), process refunds, view order history.
- **Customers:** view customers, order history, activity, spending.
- **Analytics dashboard:** sales (revenue, orders, AOV, conversion), inventory (low/out-of-stock, valuation), products (best sellers, category performance), customers (new vs returning).
- **Notifications (consume):** new orders, low-stock alerts, refund requests.

**Inventory Manager**
- Manage stock, view inventory reports, process stock adjustments.
- Inventory tracking: available stock, reserved stock, inventory movements.
- Operations: stock addition, deduction, adjustment. Low-stock alerts on threshold crossing.

## Admin-specific guidance

- **Authorization is the API's job.** This SPA only handles redirect/UX for unauthorized access — never gate sensitive data on the client. Render only what the role-scoped API returns.
- **Respect the order state machine** — surface only valid status transitions; let the API reject invalid ones.
- **Inventory changes go through movements** — adjustments post a movement (with reason), they don't overwrite a quantity. Display available vs reserved distinctly.
- Layout: fixed sidebar + full-bleed content (data-dense tables, filters, pagination). Paginate every list view.
- Use semantic state colors from `DESIGN.md` for order status, stock state, and alerts; never color-only (pair with text/icon).
- Sensitive actions (status change, refund, stock adjustment) should be auditable — the API logs them; the UI should confirm destructive actions.
