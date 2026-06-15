#!/usr/bin/env bash
# Advisory TDD hook — runs after Claude edits a source file.
# Warns (never blocks) when tests are failing, nudging back to red-green-refactor.
# Reads the PostToolUse hook payload from stdin (JSON).
#
# Exit code is always 0 (advisory). Messages go to stderr so they surface to Claude.

set -uo pipefail

payload="$(cat)"

# Extract the edited file path from the tool input (Edit/Write/MultiEdit).
file_path="$(printf '%s' "$payload" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//; s/"$//')"

# Only react to source files in our apps; ignore tests, configs, docs, deps.
case "$file_path" in
  *apps/*) : ;;
  *) exit 0 ;;
esac
case "$file_path" in
  *.test.*|*.spec.*|*node_modules*|*.md|*.json) exit 0 ;;
esac
case "$file_path" in
  *.ts|*.tsx|*.js|*.jsx) : ;;
  *) exit 0 ;;
esac

# Determine which app the file belongs to.
app_dir=""
for app in apps/api apps/storefront apps/admin; do
  case "$file_path" in
    *"$app"/*) app_dir="${file_path%%/$app/*}/$app"; app_dir="$app"; ;;
  esac
done
[ -z "$app_dir" ] && exit 0

# If the app isn't scaffolded yet (no package.json), stay quiet.
if [ ! -f "$app_dir/package.json" ]; then
  exit 0
fi

# Reminder of the discipline.
echo "🧪 TDD reminder ($app_dir): you edited implementation code — ensure a test drove this change (red → green → refactor). Target 80% coverage. (advisory)" >&2

# Best-effort: run tests for that app if a test script exists. Never block.
if grep -q '"test"' "$app_dir/package.json" 2>/dev/null; then
  echo "   Run: (cd $app_dir && npm test) to confirm green." >&2
fi

exit 0
