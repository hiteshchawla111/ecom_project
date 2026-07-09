#!/usr/bin/env bash
# HTTP smoke for M4b S2 Notification EMITTERS vs a running API (:5000) on ecom_dev.
# Usage: start the API (npm run start:dev), then: bash scripts/smoke-notifications-emitters.sh
#
# Proves the domain-event → listener → Notification-row pipeline end-to-end by
# driving REAL HTTP flows and asserting the persisted rows via psql:
#   1. Register a fresh user          → exactly one REGISTRATION_CONFIRMATION for that user.
#   2. Place an order (cart → /orders) → one NEW_ORDER (userId IS NULL) + one
#      ORDER_CONFIRMATION (customer), both referencing the new order id.
#   3. Status transitions (admin) along the legal path
#      PENDING→CONFIRMED (no notif) →PROCESSING (no notif) →SHIPPED (one SHIPPING_UPDATE)
#      →DELIVERED (one DELIVERY_UPDATE).
#   4. Seller register (→ SELLER_REGISTERED, userId IS NULL) then admin approve
#      (PENDING_REVIEW→ACTIVE → SELLER_KYC_APPROVED, seller-targeted); assert the
#      KYC row's payload has NO `kind` key (Task 2 dropped the discriminator).
#
# Test-data strategy (self-contained; cleaned up in an EXIT trap):
#   - Two fresh customers are REGISTERED via /auth/register: one for the
#     register+order+status scenarios, one for the seller scenario. Both start
#     with zero prior notifications, so every asserted row is one THIS smoke
#     caused.
#   - The order requires a product with available stock; we resolve one from the
#     DB (or skip scenarios 2–3 with a clear message if none exists).
#   - Cleanup deletes: all Notification rows for the two users + the NEW_ORDER /
#     seller-queue rows we created, the Order (+ items + stock movements), the
#     Seller (+ audit), the Cart, and the two Users. The stock reserved/deducted
#     by the order flow is released by deleting the movements the flow appended.
#     Net effect: DB is left as found.
set -euo pipefail

BASE="${BASE:-http://localhost:5000}"
DB="${DB:-ecom_dev}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Password123!}"
PASSWORD="Password123!"
TS="$(date +%s)_$$"

# --- helpers ---------------------------------------------------------------

# jget <json> <python-expr on d> -> prints the evaluated value
jget() { python3 -c 'import sys,json; d=json.load(sys.stdin); print(eval(sys.argv[1]))' "$2" <<<"$1"; }
token_of() { jget "$1" 'd["accessToken"]'; }

register_customer() { # <email>
  curl -s -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\",\"name\":\"Emitter Smoke\"}"
}
login() { # <email> <password>
  curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}"
}
psql_scalar() { psql "$DB" -tAc "$1"; }

# --- entities we create, cleaned up in the trap ----------------------------
C_EMAIL="emit_c_${TS}@example.com"     # scenario 1-3 customer
S_EMAIL="emit_s_${TS}@example.com"     # scenario 4 seller-user
CUSTOMER_ID=""
SELLER_USER_ID=""
ORDER_ID=""
SELLER_ID=""

cleanup() {
  set +e
  # Notifications for both users + the staff-queue rows referencing our order/seller.
  [ -n "$ORDER_ID" ] && psql "$DB" -q -c "DELETE FROM \"Notification\" WHERE payload->>'orderId'='$ORDER_ID';" >/dev/null 2>&1
  [ -n "$SELLER_ID" ] && psql "$DB" -q -c "DELETE FROM \"Notification\" WHERE payload->>'sellerId'='$SELLER_ID';" >/dev/null 2>&1
  [ -n "$CUSTOMER_ID" ] && psql "$DB" -q -c "DELETE FROM \"Notification\" WHERE \"userId\"='$CUSTOMER_ID';" >/dev/null 2>&1
  [ -n "$SELLER_USER_ID" ] && psql "$DB" -q -c "DELETE FROM \"Notification\" WHERE \"userId\"='$SELLER_USER_ID';" >/dev/null 2>&1
  # Order graph: stock movements (releases the reserve/deduct we appended), items, order, cart.
  if [ -n "$ORDER_ID" ]; then
    psql "$DB" -q -c "DELETE FROM \"StockMovement\" WHERE \"orderId\"='$ORDER_ID';" >/dev/null 2>&1
    psql "$DB" -q -c "DELETE FROM \"OrderItem\" WHERE \"orderId\"='$ORDER_ID';" >/dev/null 2>&1
    psql "$DB" -q -c "DELETE FROM \"Order\" WHERE id='$ORDER_ID';" >/dev/null 2>&1
  fi
  # Seller graph: audit logs, seller row.
  if [ -n "$SELLER_ID" ]; then
    psql "$DB" -q -c "DELETE FROM \"AuditLog\" WHERE \"entityType\"='Seller' AND \"entityId\"='$SELLER_ID';" >/dev/null 2>&1
    psql "$DB" -q -c "DELETE FROM \"Seller\" WHERE id='$SELLER_ID';" >/dev/null 2>&1
  fi
  # Carts + users. Delete any leftover cart items first.
  for uid in "$CUSTOMER_ID" "$SELLER_USER_ID"; do
    [ -z "$uid" ] && continue
    CID=$(psql "$DB" -tAc "SELECT id FROM \"Cart\" WHERE \"userId\"='$uid';" 2>/dev/null)
    if [ -n "$CID" ]; then
      psql "$DB" -q -c "DELETE FROM \"CartItem\" WHERE \"cartId\"='$CID';" >/dev/null 2>&1
      psql "$DB" -q -c "DELETE FROM \"Cart\" WHERE id='$CID';" >/dev/null 2>&1
    fi
    psql "$DB" -q -c "DELETE FROM \"AuditLog\" WHERE \"actorId\"='$uid';" >/dev/null 2>&1
    psql "$DB" -q -c "DELETE FROM \"RefreshToken\" WHERE \"userId\"='$uid';" >/dev/null 2>&1
    psql "$DB" -q -c "DELETE FROM \"User\" WHERE id='$uid';" >/dev/null 2>&1
  done
  set -e
}
trap cleanup EXIT

# ===========================================================================
echo "== setup: admin login =="
ATOK=$(token_of "$(login "$ADMIN_EMAIL" "$ADMIN_PASSWORD")")
test -n "$ATOK" || { echo "FAIL: admin login failed"; exit 1; }
echo "admin authenticated OK"

# ===========================================================================
echo
echo "== 1) register fresh user -> one REGISTRATION_CONFIRMATION for that user =="
CTOK=$(token_of "$(register_customer "$C_EMAIL")")
test -n "$CTOK" || { echo "FAIL: customer register failed"; exit 1; }
CUSTOMER_ID=$(psql_scalar "SELECT id FROM \"User\" WHERE email='${C_EMAIL}';")
test -n "$CUSTOMER_ID" || { echo "FAIL: could not resolve customer id"; exit 1; }
echo "registered: $C_EMAIL ($CUSTOMER_ID)"
sleep 0.5  # event listeners are async; give the write a beat.
REG_N=$(psql_scalar "SELECT count(*) FROM \"Notification\" WHERE \"userId\"='$CUSTOMER_ID' AND type='REGISTRATION_CONFIRMATION';")
echo "REGISTRATION_CONFIRMATION rows for user -> $REG_N (expect 1)"
test "$REG_N" = "1" || { echo "FAIL: expected exactly 1 REGISTRATION_CONFIRMATION, got $REG_N"; exit 1; }
echo "OK (register -> 1 REGISTRATION_CONFIRMATION)"

# ===========================================================================
echo
echo "== 2) place an order -> NEW_ORDER (userId NULL) + ORDER_CONFIRMATION (customer) =="
PRODUCT_ID=$(psql_scalar "SELECT p.id FROM \"Product\" p JOIN \"InventoryItem\" i ON i.\"productId\"=p.id WHERE p.status='ACTIVE' AND p.\"deletedAt\" IS NULL AND i.available >= 1 ORDER BY i.available DESC LIMIT 1;")
if [ -z "$PRODUCT_ID" ]; then
  echo "SKIP: no ACTIVE product with available stock in $DB — cannot exercise order/status scenarios"
  SKIP_ORDER=1
else
  echo "using product $PRODUCT_ID"
  # add to cart
  curl -s -X POST "$BASE/cart/items" -H "Authorization: Bearer $CTOK" -H 'Content-Type: application/json' \
    -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}" >/dev/null
  # place order
  ORD=$(curl -s -X POST "$BASE/orders" -H "Authorization: Bearer $CTOK" -H 'Content-Type: application/json' \
    -d '{"shipFullName":"Emitter Smoke","shipLine1":"1 Test St","shipCity":"Testville","shipState":"TS","shipCountry":"India","shipPostalCode":"123456"}')
  ORDER_ID=$(jget "$ORD" 'd["id"]')
  test -n "$ORDER_ID" || { echo "FAIL: order place failed -> $ORD"; exit 1; }
  echo "placed order: $ORDER_ID"
  sleep 0.5
  NEW_ORDER_N=$(psql_scalar "SELECT count(*) FROM \"Notification\" WHERE type='NEW_ORDER' AND \"userId\" IS NULL AND payload->>'orderId'='$ORDER_ID';")
  ORDER_CONF_N=$(psql_scalar "SELECT count(*) FROM \"Notification\" WHERE type='ORDER_CONFIRMATION' AND \"userId\"='$CUSTOMER_ID' AND payload->>'orderId'='$ORDER_ID';")
  echo "NEW_ORDER (userId NULL, this order) -> $NEW_ORDER_N (expect 1)"
  echo "ORDER_CONFIRMATION (customer, this order) -> $ORDER_CONF_N (expect 1)"
  test "$NEW_ORDER_N" = "1" || { echo "FAIL: expected 1 NEW_ORDER, got $NEW_ORDER_N"; exit 1; }
  test "$ORDER_CONF_N" = "1" || { echo "FAIL: expected 1 ORDER_CONFIRMATION, got $ORDER_CONF_N"; exit 1; }
  echo "OK (order placed -> NEW_ORDER + ORDER_CONFIRMATION)"
fi

# ===========================================================================
echo
echo "== 3) status transitions: CONFIRMED/PROCESSING no-notif; SHIPPED->SHIPPING_UPDATE; DELIVERED->DELIVERY_UPDATE =="
if [ "${SKIP_ORDER:-0}" = "1" ]; then
  echo "SKIP: no order placed (no product with stock)"
else
  patch_status() { # <status>
    curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/orders/$ORDER_ID/status" \
      -H "Authorization: Bearer $ATOK" -H 'Content-Type: application/json' -d "{\"status\":\"$1\"}"
  }
  # baseline: customer status-notif count (should be 0 so far)
  BEFORE=$(psql_scalar "SELECT count(*) FROM \"Notification\" WHERE \"userId\"='$CUSTOMER_ID' AND type IN ('SHIPPING_UPDATE','DELIVERY_UPDATE');")
  test "$BEFORE" = "0" || { echo "FAIL: expected 0 shipping/delivery notifs before transitions, got $BEFORE"; exit 1; }

  CODE=$(patch_status "CONFIRMED"); echo "PATCH ->CONFIRMED HTTP $CODE"; test "$CODE" = "200"
  sleep 0.4
  N=$(psql_scalar "SELECT count(*) FROM \"Notification\" WHERE \"userId\"='$CUSTOMER_ID' AND type IN ('SHIPPING_UPDATE','DELIVERY_UPDATE');")
  echo "  shipping/delivery notifs after CONFIRMED -> $N (expect 0)"
  test "$N" = "0" || { echo "FAIL: CONFIRMED should not add a shipping/delivery notif"; exit 1; }

  CODE=$(patch_status "PROCESSING"); echo "PATCH ->PROCESSING HTTP $CODE"; test "$CODE" = "200"
  sleep 0.4
  N=$(psql_scalar "SELECT count(*) FROM \"Notification\" WHERE \"userId\"='$CUSTOMER_ID' AND type IN ('SHIPPING_UPDATE','DELIVERY_UPDATE');")
  echo "  shipping/delivery notifs after PROCESSING -> $N (expect 0)"
  test "$N" = "0" || { echo "FAIL: PROCESSING should not add a shipping/delivery notif"; exit 1; }

  CODE=$(patch_status "SHIPPED"); echo "PATCH ->SHIPPED HTTP $CODE"; test "$CODE" = "200"
  sleep 0.4
  SHIP_N=$(psql_scalar "SELECT count(*) FROM \"Notification\" WHERE \"userId\"='$CUSTOMER_ID' AND type='SHIPPING_UPDATE' AND payload->>'orderId'='$ORDER_ID';")
  echo "  SHIPPING_UPDATE for customer (this order) -> $SHIP_N (expect 1)"
  test "$SHIP_N" = "1" || { echo "FAIL: expected 1 SHIPPING_UPDATE, got $SHIP_N"; exit 1; }

  CODE=$(patch_status "DELIVERED"); echo "PATCH ->DELIVERED HTTP $CODE"; test "$CODE" = "200"
  sleep 0.4
  DELIV_N=$(psql_scalar "SELECT count(*) FROM \"Notification\" WHERE \"userId\"='$CUSTOMER_ID' AND type='DELIVERY_UPDATE' AND payload->>'orderId'='$ORDER_ID';")
  echo "  DELIVERY_UPDATE for customer (this order) -> $DELIV_N (expect 1)"
  test "$DELIV_N" = "1" || { echo "FAIL: expected 1 DELIVERY_UPDATE, got $DELIV_N"; exit 1; }
  echo "OK (no notif on CONFIRMED/PROCESSING; 1 SHIPPING_UPDATE; 1 DELIVERY_UPDATE)"
fi

# ===========================================================================
echo
echo "== 4) seller register -> SELLER_REGISTERED; admin approve -> SELLER_KYC_APPROVED (no payload.kind) =="
STOK=$(token_of "$(register_customer "$S_EMAIL")")
test -n "$STOK" || { echo "FAIL: seller-user register failed"; exit 1; }
SELLER_USER_ID=$(psql_scalar "SELECT id FROM \"User\" WHERE email='${S_EMAIL}';")
test -n "$SELLER_USER_ID" || { echo "FAIL: could not resolve seller-user id"; exit 1; }
echo "seller-user registered: $S_EMAIL ($SELLER_USER_ID)"

SREG=$(curl -s -X POST "$BASE/seller/register" -H "Authorization: Bearer $STOK" -H 'Content-Type: application/json' \
  -d "{\"displayName\":\"Emitter Smoke Store ${TS}\"}")
SELLER_ID=$(psql_scalar "SELECT id FROM \"Seller\" WHERE \"userId\"='$SELLER_USER_ID';")
test -n "$SELLER_ID" || { echo "FAIL: seller register failed -> $SREG"; exit 1; }
echo "seller registered: $SELLER_ID (PENDING_REVIEW)"
sleep 0.5
SREG_N=$(psql_scalar "SELECT count(*) FROM \"Notification\" WHERE type='SELLER_REGISTERED' AND \"userId\" IS NULL AND payload->>'sellerId'='$SELLER_ID';")
echo "SELLER_REGISTERED (staff queue, this seller) -> $SREG_N (expect 1)"
test "$SREG_N" = "1" || { echo "FAIL: expected 1 SELLER_REGISTERED, got $SREG_N"; exit 1; }

# Approve: PENDING_REVIEW -> ACTIVE emits SELLER_KYC_APPROVED.
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/admin/sellers/$SELLER_ID/status" \
  -H "Authorization: Bearer $ATOK" -H 'Content-Type: application/json' -d '{"status":"ACTIVE"}')
echo "PATCH /admin/sellers/$SELLER_ID/status ->ACTIVE HTTP $CODE"
test "$CODE" = "200" || { echo "FAIL: seller approve expected 200, got $CODE"; exit 1; }
sleep 0.5
KYC_N=$(psql_scalar "SELECT count(*) FROM \"Notification\" WHERE type='SELLER_KYC_APPROVED' AND \"userId\"='$SELLER_USER_ID' AND payload->>'sellerId'='$SELLER_ID';")
echo "SELLER_KYC_APPROVED (seller-targeted, this seller) -> $KYC_N (expect 1)"
test "$KYC_N" = "1" || { echo "FAIL: expected 1 SELLER_KYC_APPROVED, got $KYC_N"; exit 1; }

HAS_KIND=$(psql_scalar "SELECT payload ? 'kind' FROM \"Notification\" WHERE type='SELLER_KYC_APPROVED' AND payload->>'sellerId'='$SELLER_ID' ORDER BY \"createdAt\" DESC LIMIT 1;")
echo "SELLER_KYC_APPROVED payload has 'kind' key -> $HAS_KIND (expect f)"
test "$HAS_KIND" = "f" || { echo "FAIL: SELLER_KYC_APPROVED payload still carries a 'kind' discriminator"; exit 1; }
echo "OK (SELLER_REGISTERED + SELLER_KYC_APPROVED typed rows; no payload.kind)"

echo
echo "ALL NOTIFICATION-EMITTER SMOKE CHECKS PASSED"
