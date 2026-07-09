#!/usr/bin/env bash
# HTTP smoke for M4b S3 NotificationChannel (mock) dispatch vs a running API (:5000) on ecom_dev.
#
# Usage: start the API with the server log captured to a file, e.g.
#   cd apps/api && npm run start:dev > /tmp/api-s3.log 2>&1 &
# then:
#   CHANNEL_LOG=/tmp/api-s3.log bash scripts/smoke-notification-channel.sh
#
# Proves that each PERSISTED notification is ALSO dispatched through the
# MockNotificationChannel, which logs a deterministic line via the Nest Logger:
#   "would send <TYPE> to user <id>"   (userId present)
#   "would send <TYPE> to staff-queue" (userId null)
# by driving REAL HTTP flows and asserting BOTH:
#   (a) the HTTP request succeeded (2xx) — dispatch is non-blocking / swallow-on-failure, and
#   (b) the expected "would send ..." line appears in the captured server log.
#
# Scenarios:
#   1. Register a fresh user (POST /auth/register, 201)
#        -> "would send REGISTRATION_CONFIRMATION to user <that-user-id>"
#   2. Place an order (cart -> POST /orders, 201)
#        -> "would send NEW_ORDER to staff-queue" AND
#           "would send ORDER_CONFIRMATION to user <that-user-id>"
#   3. Transition the order to SHIPPED along the legal path (admin PATCH /orders/:id/status)
#        -> "would send SHIPPING_UPDATE to user <that-user-id>"
#
# Log-matching strategy (shared, append-only log file):
#   Before each action we snapshot the CURRENT line count of the log; after the
#   action we grep ONLY the newly-appended tail for the expected substring. We
#   also match on the freshly-registered user id, so we never match stale lines
#   from an earlier boot or another run.
#
# Test-data strategy (self-contained; cleaned up in an EXIT trap):
#   - One fresh customer is REGISTERED via /auth/register.
#   - The order requires a product with available stock, resolved from the DB
#     (scenarios 2-3 SKIP with a clear message if none exists).
#   - Cleanup deletes: the customer's Notification rows + the NEW_ORDER staff row
#     for our order, the Order (+ items + stock movements, releasing the reserve/
#     deduct), the Cart (+ items), RefreshToken (before User), AuditLog, and the
#     User. Net effect: DB is left as found.
set -euo pipefail

BASE="${BASE:-http://localhost:5000}"
DB="${DB:-ecom_dev}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Password123!}"
PASSWORD="Password123!"
TS="$(date +%s)_$$"

# The captured server log to grep for the mock-channel "would send ..." lines.
CHANNEL_LOG="${CHANNEL_LOG:-/private/tmp/claude-502/-Users-sotsys033-Desktop-HITESH-CLAUDE-13jun-sat-apps-api/0ff720a2-39e7-417b-a197-a4c66ea879a5/scratchpad/api-s3.log}"
test -f "$CHANNEL_LOG" || { echo "FAIL: server log not found at CHANNEL_LOG=$CHANNEL_LOG (start the API redirecting stdout+stderr there first)"; exit 1; }

# --- helpers ---------------------------------------------------------------

jget() { python3 -c 'import sys,json; d=json.load(sys.stdin); print(eval(sys.argv[1]))' "$2" <<<"$1"; }
token_of() { jget "$1" 'd["accessToken"]'; }

register_customer() { # <email>
  curl -s -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\",\"name\":\"Channel Smoke\"}"
}
login() { # <email> <password>
  curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}"
}
psql_scalar() { psql "$DB" -tAc "$1"; }

log_lines() { wc -l < "$CHANNEL_LOG" | tr -d ' '; }
# assert_log_since <start-line-exclusive> <grep-substring> <human-label>
# Greps ONLY the tail appended after <start-line> for a FIXED-string match.
assert_log_since() {
  local from="$1" needle="$2" label="$3" hit
  # small settle: dispatch runs after persist within the request, but flush the file.
  sleep 0.4
  hit=$(tail -n "+$((from + 1))" "$CHANNEL_LOG" | grep -F "$needle" || true)
  if [ -n "$hit" ]; then
    echo "  OK  channel log: $label"
    echo "      matched: $(printf '%s' "$hit" | sed -E 's/\x1b\[[0-9;]*m//g' | head -n1 | sed -E 's/.*(would send.*)/\1/')"
  else
    echo "  FAIL missing channel log line for: $label"
    echo "      expected substring: $needle"
    echo "      --- tail of log since line $from ---"
    tail -n "+$((from + 1))" "$CHANNEL_LOG" | sed -E 's/\x1b\[[0-9;]*m//g' | tail -n 20
    exit 1
  fi
}

# --- entities we create, cleaned up in the trap ----------------------------
C_EMAIL="chan_c_${TS}@example.com"
CUSTOMER_ID=""
ORDER_ID=""

cleanup() {
  set +e
  [ -n "$ORDER_ID" ] && psql "$DB" -q -c "DELETE FROM \"Notification\" WHERE payload->>'orderId'='$ORDER_ID';" >/dev/null 2>&1
  [ -n "$CUSTOMER_ID" ] && psql "$DB" -q -c "DELETE FROM \"Notification\" WHERE \"userId\"='$CUSTOMER_ID';" >/dev/null 2>&1
  if [ -n "$ORDER_ID" ]; then
    psql "$DB" -q -c "DELETE FROM \"StockMovement\" WHERE \"orderId\"='$ORDER_ID';" >/dev/null 2>&1
    psql "$DB" -q -c "DELETE FROM \"OrderItem\" WHERE \"orderId\"='$ORDER_ID';" >/dev/null 2>&1
    psql "$DB" -q -c "DELETE FROM \"Order\" WHERE id='$ORDER_ID';" >/dev/null 2>&1
  fi
  if [ -n "$CUSTOMER_ID" ]; then
    CID=$(psql "$DB" -tAc "SELECT id FROM \"Cart\" WHERE \"userId\"='$CUSTOMER_ID';" 2>/dev/null)
    if [ -n "$CID" ]; then
      psql "$DB" -q -c "DELETE FROM \"CartItem\" WHERE \"cartId\"='$CID';" >/dev/null 2>&1
      psql "$DB" -q -c "DELETE FROM \"Cart\" WHERE id='$CID';" >/dev/null 2>&1
    fi
    psql "$DB" -q -c "DELETE FROM \"AuditLog\" WHERE \"actorId\"='$CUSTOMER_ID';" >/dev/null 2>&1
    psql "$DB" -q -c "DELETE FROM \"RefreshToken\" WHERE \"userId\"='$CUSTOMER_ID';" >/dev/null 2>&1
    psql "$DB" -q -c "DELETE FROM \"User\" WHERE id='$CUSTOMER_ID';" >/dev/null 2>&1
  fi
  set -e
}
trap cleanup EXIT

# ===========================================================================
echo "== setup: admin login =="
ATOK=$(token_of "$(login "$ADMIN_EMAIL" "$ADMIN_PASSWORD")")
test -n "$ATOK" || { echo "FAIL: admin login failed"; exit 1; }
echo "admin authenticated OK; channel log = $CHANNEL_LOG"

# ===========================================================================
echo
echo "== 1) register fresh user -> REGISTRATION_CONFIRMATION dispatched to user =="
FROM=$(log_lines)
REG_RESP=$(curl -s -w $'\n%{http_code}' -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$C_EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Channel Smoke\"}")
REG_CODE=$(tail -n1 <<<"$REG_RESP")
REG_BODY=$(sed '$d' <<<"$REG_RESP")
echo "POST /auth/register -> HTTP $REG_CODE (expect 201)"
test "$REG_CODE" = "201" || { echo "FAIL: register expected 201, got $REG_CODE -> $REG_BODY"; exit 1; }
CTOK=$(token_of "$REG_BODY")
test -n "$CTOK" || { echo "FAIL: register returned no accessToken"; exit 1; }
CUSTOMER_ID=$(psql_scalar "SELECT id FROM \"User\" WHERE email='${C_EMAIL}';")
test -n "$CUSTOMER_ID" || { echo "FAIL: could not resolve customer id"; exit 1; }
echo "registered: $C_EMAIL ($CUSTOMER_ID)"
assert_log_since "$FROM" "would send REGISTRATION_CONFIRMATION to user $CUSTOMER_ID" \
  "would send REGISTRATION_CONFIRMATION to user $CUSTOMER_ID"
echo "OK (register 201 + channel dispatch)"

# ===========================================================================
echo
echo "== 2) place an order -> NEW_ORDER (staff-queue) + ORDER_CONFIRMATION (user) dispatched =="
PRODUCT_ID=$(psql_scalar "SELECT p.id FROM \"Product\" p JOIN \"InventoryItem\" i ON i.\"productId\"=p.id WHERE p.status='ACTIVE' AND p.\"deletedAt\" IS NULL AND i.available >= 1 ORDER BY i.available DESC LIMIT 1;")
if [ -z "$PRODUCT_ID" ]; then
  echo "SKIP: no ACTIVE product with available stock in $DB — cannot exercise order/status scenarios"
  SKIP_ORDER=1
else
  echo "using product $PRODUCT_ID"
  curl -s -o /dev/null -X POST "$BASE/cart/items" -H "Authorization: Bearer $CTOK" -H 'Content-Type: application/json' \
    -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}"
  FROM=$(log_lines)
  ORD_RESP=$(curl -s -w $'\n%{http_code}' -X POST "$BASE/orders" -H "Authorization: Bearer $CTOK" -H 'Content-Type: application/json' \
    -d '{"shipFullName":"Channel Smoke","shipLine1":"1 Test St","shipCity":"Testville","shipState":"TS","shipCountry":"India","shipPostalCode":"123456"}')
  ORD_CODE=$(tail -n1 <<<"$ORD_RESP")
  ORD_BODY=$(sed '$d' <<<"$ORD_RESP")
  echo "POST /orders -> HTTP $ORD_CODE (expect 201)"
  test "$ORD_CODE" = "201" || { echo "FAIL: order expected 201, got $ORD_CODE -> $ORD_BODY"; exit 1; }
  ORDER_ID=$(jget "$ORD_BODY" 'd["id"]')
  test -n "$ORDER_ID" || { echo "FAIL: order place returned no id -> $ORD_BODY"; exit 1; }
  echo "placed order: $ORDER_ID"
  assert_log_since "$FROM" "would send NEW_ORDER to staff-queue" \
    "would send NEW_ORDER to staff-queue"
  assert_log_since "$FROM" "would send ORDER_CONFIRMATION to user $CUSTOMER_ID" \
    "would send ORDER_CONFIRMATION to user $CUSTOMER_ID"
  echo "OK (order 201 + 2 channel dispatches)"
fi

# ===========================================================================
echo
echo "== 3) transition order to SHIPPED -> SHIPPING_UPDATE dispatched to user =="
if [ "${SKIP_ORDER:-0}" = "1" ]; then
  echo "SKIP: no order placed (no product with stock)"
else
  patch_status() { # <status>
    curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/orders/$ORDER_ID/status" \
      -H "Authorization: Bearer $ATOK" -H 'Content-Type: application/json' -d "{\"status\":\"$1\"}"
  }
  # Legal path: PENDING -> CONFIRMED -> PROCESSING -> SHIPPED.
  CODE=$(patch_status "CONFIRMED");  echo "PATCH ->CONFIRMED HTTP $CODE";  test "$CODE" = "200"
  CODE=$(patch_status "PROCESSING"); echo "PATCH ->PROCESSING HTTP $CODE"; test "$CODE" = "200"
  FROM=$(log_lines)
  CODE=$(patch_status "SHIPPED");    echo "PATCH ->SHIPPED HTTP $CODE (expect 200)"; test "$CODE" = "200"
  assert_log_since "$FROM" "would send SHIPPING_UPDATE to user $CUSTOMER_ID" \
    "would send SHIPPING_UPDATE to user $CUSTOMER_ID"
  echo "OK (SHIPPED 200 + channel dispatch)"
fi

echo
echo "ALL NOTIFICATION-CHANNEL SMOKE CHECKS PASSED"
