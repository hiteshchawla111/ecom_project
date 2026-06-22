---
name: verify-slice
description: Use when closing a slice/task or before claiming work done in this e-commerce monorepo — runs the full verification gate (test + e2e + lint + build per touched app, plus working-tree-clean and no-stray-worktree checks) and reports pass/fail. Prevents lint/build slipping past per-task verification.
---

# Verify Slice (this project)

The single command for the per-slice/per-task verification gate. Replaces hand-assembling the same `npm test && lint && build && git status` bash every cycle. Born from M1, where lint slipped past per-task verification to the slice gate twice because the gate wasn't mechanized.

## When to use

- After an implementer (or you) finishes a task, **before** marking it complete.
- At a slice gate, before the stop-and-verify hand-off.
- Before claiming any work "done" (RULE.md §5).

## How to run

From anywhere in the repo:

```bash
bash .claude/skills/verify-slice/verify-slice.sh            # auto-detect changed apps
bash .claude/skills/verify-slice/verify-slice.sh api        # gate one app
bash .claude/skills/verify-slice/verify-slice.sh api admin  # gate several
```

The script:
- Picks the right gate per app — **api**: `test` + `test:e2e` + `lint` + `build`; **admin**: `test` + `lint` + `build` (no e2e script); **storefront**: `test` + `test:e2e` + `lint` + `build`. A missing script is skipped, not failed.
- Runs `lint` (which is `eslint --fix`) and then asserts the **working tree is clean** — so `--fix` reformatting can't silently slip to the next gate (the #1 M1 friction).
- Checks for **stray agent worktrees** under `.claude/worktrees/` — implementer subagents occasionally spawn one; it must be removed before merge.
- Prints `GATE PASSED ✅` (exit 0) or `GATE FAILED ❌` (exit 1) with the failing log tail.

## Interpreting the result

- **PASSED** → the slice/task meets the mechanical bar. (Still do the live smoke-run vs `ecom_dev` / the browser per RULE.md §5 — this gate is necessary, not sufficient.)
- **FAILED on lint + dirty tree** → the implementer committed before `lint --fix` ran. Stage the reformatted files into the commit (or amend), then re-run. For spec files using `as any` mocks, add the `/* eslint-disable @typescript-eslint/no-unsafe-* */` header block (project convention).
- **FAILED on a stray worktree** → an implementer spawned a git worktree under `.claude/worktrees/`. Confirm it has no unique commits (`git log --oneline main..<branch>`), then `git worktree remove --force <path> && git branch -D <branch>`. (`.claude/worktrees/` is gitignored.)
- **FAILED on test/build** → read the printed log tail (`/tmp/verify-<app>-<script>.log`) and fix before proceeding.

## Notes

- Mechanical only — it asserts the gate; it does not fix anything or run the app for a live smoke.
- Commands run with `npm --prefix apps/<app>` (the script handles cwd). Note: **prisma** commands separately need `cwd=apps/api` (the config resolves the schema relative to cwd) — that's not part of this gate.
- Pairs with the `tdd` skill (red-green-refactor) and RULE.md §5 (verify before claiming done).
