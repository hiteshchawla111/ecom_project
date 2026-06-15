# RULE.md — Project Working Rules

Rules that govern how work is carried out in this repository. These apply to all apps (`apps/storefront`, `apps/admin`, `apps/api`) and are referenced by the root `CLAUDE.md`.

## 1. One Feature at a Time — Stop and Verify

- Implement **one feature at a time**.
- After completing any single feature, **STOP and ask the user to verify** before starting the next.
- **Do not** implement multiple features, or complete all features, in one go.
- Only proceed to the next feature after the user confirms the current one is verified.

## 2. Keep PLAN.md Updated

- `PLAN.md` is the live progress tracker and source of truth for task status.
- When a task or phase starts or finishes, update its checkbox and the status tables.
- Status legend: ⬜ Not Started · 🟡 In Progress · ✅ Done.

## 3. Scaffolding & Setup

- Do not scaffold apps or run installs without explicit user confirmation.
- Do not run `git init` or create commits unless the user asks.

## 4. Test-Driven Development (TDD)

- Build features **test-first**: red (failing test) → green (minimum code) → refactor.
- Use the project TDD plugin: the `tdd` skill, the `/tdd` command, and the `tdd-runner` agent (see `.claude/README.md`).
- Coverage target **80%** (advisory). Prioritize the domain-critical logic: order state machine, inventory ledger, cart/total pipeline, authorization.

## 5. Verify Before Claiming Done

- A feature is not "done" until it compiles, lint passes, and tests pass (where applicable).
- Report outcomes honestly — if something is skipped or failing, say so.
