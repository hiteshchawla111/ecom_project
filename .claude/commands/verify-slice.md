---
description: Run the full per-slice verification gate (test + e2e + lint + build per touched app, plus tree-clean + no-stray-worktree) and report pass/fail.
---

Run the project verification gate for: **$ARGUMENTS** (app names like `api admin`, or leave empty to auto-detect changed apps).

Follow the `verify-slice` skill. Steps:

1. Run the gate:
   ```bash
   bash .claude/skills/verify-slice/verify-slice.sh $ARGUMENTS
   ```
2. Report the result plainly — `GATE PASSED ✅` or `GATE FAILED ❌` — and if it failed, summarize **which** check failed (lint/test/build/tree/worktree) and the fix per the skill's "Interpreting the result" section. Do not claim the slice is done on a failed gate.
3. If it passed, remind that a **live smoke-run** (API vs `ecom_dev` over HTTP, or the app in the browser) is still required before truly done (RULE.md §5) — this gate is necessary, not sufficient.
