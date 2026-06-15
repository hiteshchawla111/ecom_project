---
name: tdd
description: Use when implementing any feature or bugfix in this e-commerce monorepo, before writing implementation code. Enforces red-green-refactor TDD tailored to the NestJS API, React+Vite admin, and Next.js storefront. Disciplined but advisory; 80% coverage target.
---

# Test-Driven Development (this project)

Write the test first. Watch it fail. Make it pass with the simplest code. Refactor. Repeat. This is **disciplined but advisory** — follow it closely, but it does not hard-block edits.

## The Loop (per feature, one at a time)

1. **RED** — Write a failing test that describes the next small behavior. Run it. **Confirm it fails for the right reason** (assertion, not a typo/import error).
2. **GREEN** — Write the *minimum* implementation to make it pass. No extra features. Run the test. Confirm green.
3. **REFACTOR** — Clean up names, duplication, structure with tests still green. Re-run.
4. **STOP** — Per project `RULE.md`: after the feature is green + refactored, stop and ask the user to verify before the next feature. Update `PLAN.md`.

Never write implementation code without a failing test that demands it. If you catch yourself writing code "to be safe" or "for later" — stop, that's untested code.

## Stack tooling

| App | Unit/Integration | E2E | Coverage |
|-----|------------------|-----|----------|
| `apps/api` (NestJS) | Jest (`npm test`) | `npm run test:e2e` | `npm test -- --coverage` |
| `apps/admin` (React+Vite) | Vitest + React Testing Library | — | `npm test -- --coverage` |
| `apps/storefront` (Next.js) | Vitest/Jest + RTL | Playwright | `--coverage` |

Run a single test: `npm test -- <name-or-path-pattern>`. **Coverage target: 80%** (lines/branches) — advisory.

## What to test first in this domain (highest value)

These are the PRD's business-critical rules — test them thoroughly, test-first:

- **Order state machine** — every valid transition passes; every invalid transition is rejected. (`Pending→Confirmed→Processing→Shipped→Delivered`, `Cancelled`, `Refunded`.)
- **Inventory ledger** — placing an order reserves stock; fulfillment deducts; cancellation releases. Movements are append-only; available vs reserved stay correct. Low-stock alert fires at threshold.
- **Cart/total pipeline** — `subtotal → discounts → taxes → shipping → grand total`. Test edge cases: empty cart, sale prices, zero shipping, rounding.
- **Authorization** — each role reaches only permitted endpoints; cross-role access is rejected.

## Test design rules

- **Behavior, not implementation.** Assert on outputs/state, not internal calls. Tests survive refactors.
- **One reason to fail per test.** Arrange-Act-Assert. Descriptive names (`rejects Shipped→Pending transition`).
- **Pure logic = pure unit tests.** State machine and total pipeline should be testable without a DB.
- **Mock at the boundary** (DB/HTTP), not the unit under test. Prefer in-memory/test DB for repository integration tests.
- **Frontend:** test user-visible behavior via RTL (roles/labels), not component internals. E2E (Playwright) for critical storefront flows: browse → cart → checkout → order.

## Red flags (stop and correct)

| Thought | Reality |
|---------|---------|
| "I'll write tests after" | That's not TDD. Test first or you'll test to fit the code. |
| "This is too simple to test" | The state machine looked simple too. Test it. |
| "Test passes on first run" | Suspicious — did it ever fail? Verify RED first. |
| "I'll batch a few features then test" | Violates RULE.md. One feature, then stop and verify. |
| "Mocking everything" | Over-mocked tests assert nothing. Mock only boundaries. |
