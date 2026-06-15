# TDD Plugin (project-local)

Test-driven development tooling for this e-commerce monorepo. Disciplined-but-advisory: it guides red-green-refactor and warns on failures, but does not hard-block edits. Coverage target 80%.

## Contents

| File | What it does |
|------|--------------|
| `skills/tdd/SKILL.md` | The TDD methodology, tailored to NestJS / React+Vite / Next.js and this domain's critical logic. Loaded on demand via the `Skill` tool or auto-triggered when implementing features. |
| `commands/tdd.md` | `/tdd <feature>` — drives one feature through a full red-green-refactor cycle, then stops for verification. |
| `agents/tdd-runner.md` | `tdd-runner` subagent — runs the TDD loop autonomously for one well-scoped feature. |
| `hooks/tdd-check.sh` | Advisory PostToolUse hook — after editing source, reminds you to test-first and runs the app's tests if available. Never blocks; stays silent until an app is scaffolded. |
| `settings.json` | Registers the hook. |

## Usage

- **Start a feature test-first:** `/tdd implement order status transition guard`
- **Delegate to the subagent:** ask Claude to use the `tdd-runner` agent for a scoped task.
- **The skill** auto-applies when implementing features; it encodes the loop and what to test first.

## Discipline (also in `RULE.md`)

- Write the failing test first; confirm RED before implementing.
- Minimum code to GREEN; then REFACTOR with tests green.
- **One feature at a time — stop and ask for verification** before the next.
- Prioritize: order state machine, inventory ledger, cart/total pipeline, authorization.

## Notes

- The hook is advisory (exit 0 always) and degrades gracefully: until an app has a `package.json`, it produces no output.
- Once apps are scaffolded, ensure each has a `test` script (Jest for `api`, Vitest for `admin`/`storefront`) so the hook can run them.
