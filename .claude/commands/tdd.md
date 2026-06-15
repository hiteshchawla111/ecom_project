---
description: Drive one feature through a full red-green-refactor TDD cycle, then stop for verification.
---

Implement the following using strict test-driven development: **$ARGUMENTS**

Follow the project `tdd` skill and `RULE.md`. Work on **one feature only**, then stop.

Steps:

1. **Clarify** the smallest next behavior to build. State it in one sentence.
2. **RED** — Write a failing test for that behavior in the correct app's test suite. Run it. Show the failure and confirm it fails for the *right* reason (assertion, not setup error).
3. **GREEN** — Write the minimum code to pass. Run the test. Confirm green.
4. **REFACTOR** — Improve names/duplication/structure with tests green. Re-run.
5. **Coverage** — Report coverage for the touched area (target 80%, advisory).
6. **STOP** — Update `PLAN.md` status, summarize what changed, and **ask the user to verify** before any further work. Do not start the next feature.

Prioritize the domain-critical logic (order state machine, inventory ledger, cart/total pipeline, authorization) as pure unit tests where possible.
