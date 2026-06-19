# RULE.md — Project Working Rules

Rules that govern how work is carried out in this repository. These apply to all apps (`apps/storefront`, `apps/admin`, `apps/api`) and are referenced by the root `CLAUDE.md`.

## 1. One Feature at a Time — Stop and Verify

- Implement **one feature at a time**.
- After completing any single feature, **STOP and ask the user to verify** before starting the next.
- **Do not** implement multiple features, or complete all features, in one go.
- Only proceed to the next feature after the user confirms the current one is verified.
- A **phase may contain multiple tasks** (see the per-phase task lists in `PLAN.md`). Treat **each task as a stopping point**: when one task in a phase is done, **STOP and ask the user to verify** before starting the next — do not roll through all of a phase's tasks in one go just because they share a phase.
- The unit of "stop and verify" is the **smallest independently-verifiable task**, not the phase. When in doubt, stop more often, not less.

## 2. Keep PLAN.md Updated

- `PLAN.md` is the live progress tracker and source of truth for task status.
- When a task or phase starts or finishes, update its checkbox and the status tables.
- Status legend: ⬜ Not Started · 🟡 In Progress · ✅ Done.

## 3. Scaffolding & Setup

- Do not scaffold apps or run installs without explicit user confirmation.
- Do not run `git init` or create commits unless the user asks.
- **Do not `git push` (or push branches/tags to any remote) without explicit user permission.** Committing locally is fine when asked; publishing to a remote always requires the user's go-ahead.

## 4. Test-Driven Development (TDD)

- Build features **test-first**: red (failing test) → green (minimum code) → refactor.
- Use the project TDD plugin: the `tdd` skill, the `/tdd` command, and the `tdd-runner` agent (see `.claude/README.md`).
- Coverage target **80%** (advisory). Prioritize the domain-critical logic: order state machine, inventory ledger, cart/total pipeline, authorization.

## 5. Verify Before Claiming Done

- A feature is not "done" until it compiles, lint passes, and tests pass (where applicable).
- **Smoke-run the real thing before claiming a slice done.** Unit tests mock dependencies (e.g. Prisma) and cannot prove the app actually boots and serves. Before marking a backend slice complete, start the API against the real dev DB (`ecom_dev`) and exercise the new endpoints over HTTP; for a frontend slice, run the app and verify the change in the browser. Tests + compile + lint are necessary, not sufficient.
- Report outcomes honestly — if something is skipped or failing, say so.

## 6. Phase Completion — Handoff Prompt

- When a **phase is fully complete** (every task in it verified and the phase marked ✅ in `PLAN.md`), **STOP** and — in addition to the §1 verification — **produce a copy-pasteable "resume prompt"** the user can paste into a fresh session to continue from exactly where work stopped.
- The resume prompt must be **self-contained enough to orient a cold session** but must **not restate status that already lives in `PLAN.md`** — it **points there** instead. Avoid creating a second source of truth that can drift.
- The resume prompt should include: **(a)** which phase/task just completed, **(b)** the next phase/task to start, **(c)** the current branch and whether it's merged to `main`, **(d)** **read-first pointers** (`CLAUDE.md`, `RULE.md`, `PLAN.md`, and the relevant `docs/superpowers/specs|plans/*` for the next slice), and **(e)** any one-time gotcha not captured elsewhere.
- Present it in a **fenced code block** so the user can copy it verbatim.
