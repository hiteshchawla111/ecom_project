#!/usr/bin/env bash
# verify-slice.sh — run the full per-slice verification gate for this monorepo.
#
# Usage: verify-slice.sh [app ...]
#   With no args: auto-detects which apps have uncommitted/recent changes and gates those.
#   With args (api|admin|storefront): gates exactly those apps.
#
# For each app it runs the gate appropriate to that app:
#   api        → test, test:e2e, lint, build
#   admin      → test, lint, build            (no e2e script)
#   storefront → test, test:e2e, lint, build
# Then repo-wide: working tree must be clean, and no stray git worktrees.
#
# Exit 0 = gate passed. Exit 1 = something failed (details printed).
# Mechanical only — it asserts the gate; the caller decides what to do with a failure.

set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "not a git repo"; exit 1; }
cd "$ROOT" || exit 1

FAIL=0
note() { printf '%s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*"; FAIL=1; }

# --- which apps to gate ---
APPS=("$@")
if [ ${#APPS[@]} -eq 0 ]; then
  # Auto-detect: any app with changes vs origin/main (or, if no upstream, vs main).
  BASE="origin/main"; git rev-parse --verify "$BASE" >/dev/null 2>&1 || BASE="main"
  CHANGED="$(git diff --name-only "$BASE"...HEAD 2>/dev/null; git status --porcelain | awk '{print $2}')"
  for a in api admin storefront; do
    if printf '%s\n' "$CHANGED" | grep -q "^apps/$a/"; then APPS+=("$a"); fi
  done
  if [ ${#APPS[@]} -eq 0 ]; then
    note "No app changes detected vs $BASE — nothing to gate. (Pass an app name to force.)"
    note ""; note "GATE PASSED ✅ (no app changes)"
    exit 0
  fi
  note "Auto-detected changed apps: ${APPS[*]}"
fi

run() {  # run <label> <app> <script>
  local label="$1" app="$2" script="$3"
  if ! node -e "process.exit((require('./apps/$app/package.json').scripts||{})['$script']?0:1)" 2>/dev/null; then
    note "  • $label: (no '$script' script — skipped)"; return 0
  fi
  if npm --prefix "apps/$app" run "$script" >"/tmp/verify-$app-$script.log" 2>&1 \
     || { [ "$script" = "test" ] && npm --prefix "apps/$app" test >"/tmp/verify-$app-$script.log" 2>&1; }; then
    note "  ✓ $label"
  else
    fail "$app $script — see /tmp/verify-$app-$script.log"; tail -8 "/tmp/verify-$app-$script.log" | sed 's/^/      /'
  fi
}

for app in "${APPS[@]}"; do
  note ""; note "=== $app ==="
  run "test"  "$app" "test"
  run "e2e"   "$app" "test:e2e"
  run "lint"  "$app" "lint"
  run "build" "$app" "build"
done

# --- repo-wide checks ---
note ""; note "=== repo-wide ==="
if [ -z "$(git status --porcelain)" ]; then
  note "  ✓ working tree clean"
else
  fail "working tree NOT clean (lint --fix churn? un-staged changes?) — git status:"; git status --porcelain | sed 's/^/      /'
fi

STRAY="$(git worktree list --porcelain | awk '/^worktree/{print $2}' | grep -F "$ROOT/.claude/worktrees/" || true)"
if [ -z "$STRAY" ]; then
  note "  ✓ no stray agent worktrees"
else
  fail "stray agent worktree(s) present (an implementer spawned one) — remove before merge:"; printf '%s\n' "$STRAY" | sed 's/^/      /'
fi

note ""
if [ "$FAIL" -eq 0 ]; then note "GATE PASSED ✅"; else note "GATE FAILED ❌"; fi
exit "$FAIL"
