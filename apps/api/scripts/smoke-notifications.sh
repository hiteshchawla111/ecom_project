#!/usr/bin/env bash
# HTTP smoke for M4b Notifications consumption API vs a running API (:5000) on ecom_dev.
# Usage: start the API (npm run start:dev), then: bash scripts/smoke-notifications.sh
#
# Covers, against real seeded/prior-smoke data (there are LOW_STOCK / NEW_REVIEW /
# REGISTRATION_CONFIRMATION rows with userId:null from earlier smokes):
#   1. unauthenticated GET /notifications           -> 401
#   2. admin: shared userId:null staff queue visible; unread-count > 0;
#      read-all -> {updated:N}; then unread-count -> {count:0}
#   3. customer: GET /notifications returns ONLY own rows (no userId:null leak);
#      a known staff-queue id is absent; unread-count matches own unread
#   4. mark-read semantics: PATCH :id/read on an OWN row -> 204; readAt set (psql);
#      re-PATCH -> 204 (idempotent); PATCH a NOT-VISIBLE staff id -> 404;
#      PATCH an absent id -> 404 (also proves read-all vs :id/read route order)
#   5. ?unread=true returns only unread rows (the just-read row drops out)
#
# Test data strategy (documented, restored at the end):
#   - A fresh customer is REGISTERED via /auth/register (self-contained, like the
#     reviews smoke). A fresh customer has NO personal notifications, so we INSERT
#     two REGISTRATION_CONFIRMATION rows for that customer via psql (ids prefixed
#     smoke_notif_) to exercise own-row visibility + mark-read. These rows are
#     DELETED in a trap at exit. No seed rows are modified except the admin
#     read-all in scenario 2, which flips readAt on the SHARED staff queue; the
#     trap re-marks those staff rows unread (readAt = NULL) to restore state.
set -euo pipefail

BASE="${BASE:-http://localhost:5000}"
DB="${DB:-ecom_dev}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Password123!}"
PASSWORD="Password123!"
TS="$(date +%s)_$$"
NOTIF_PREFIX="smoke_notif_${TS}"

# --- helpers ---------------------------------------------------------------

# jget <json> <python-expr on d> -> prints the evaluated value
jget() { python3 -c 'import sys,json; d=json.load(sys.stdin); print(eval(sys.argv[1]))' "$2" <<<"$1"; }

token_of() { jget "$1" 'd["accessToken"]'; }

register_customer() { # <email>
  curl -s -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\",\"name\":\"Notif Smoke\"}"
}

login() { # <email> <password>
  curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}"
}

# --- state we may mutate, restored in the trap -----------------------------
# STAFF_UNREAD_BEFORE holds the userId:null ids we mark read via read-all, so we
# can flip them back to unread on exit. Populated in scenario 2.
STAFF_MARKED_IDS=""

cleanup() {
  # Delete the customer-owned rows we inserted.
  psql "$DB" -q -c "DELETE FROM \"Notification\" WHERE id LIKE '${NOTIF_PREFIX}%';" >/dev/null 2>&1 || true
  # Restore the shared staff queue rows we marked read via read-all to unread.
  if [ -n "$STAFF_MARKED_IDS" ]; then
    psql "$DB" -q -c "UPDATE \"Notification\" SET \"readAt\" = NULL WHERE id IN ($STAFF_MARKED_IDS);" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# ===========================================================================
echo "== 1) unauthenticated GET /notifications -> 401 =="
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/notifications")
echo "GET /notifications (no auth) -> HTTP $CODE"
test "$CODE" = "401"
echo "OK (401 unauthenticated)"

# ===========================================================================
echo
echo "== setup: admin login + fresh customer =="
ATOK=$(token_of "$(login "$ADMIN_EMAIL" "$ADMIN_PASSWORD")")
test -n "$ATOK" || { echo "FAIL: admin login failed"; exit 1; }
echo "admin authenticated OK"

C_EMAIL="notif_c_${TS}@example.com"
CTOK=$(token_of "$(register_customer "$C_EMAIL")")
test -n "$CTOK" || { echo "FAIL: customer register failed"; exit 1; }
CUSTOMER_ID=$(psql "$DB" -tAc "SELECT id FROM \"User\" WHERE email='${C_EMAIL}';")
test -n "$CUSTOMER_ID" || { echo "FAIL: could not resolve customer id"; exit 1; }
echo "customer registered: $C_EMAIL ($CUSTOMER_ID)"

# Insert two customer-owned notifications (fresh customer has none of its own).
# NB: Notification.id is @default(cuid()); a raw INSERT must supply an id, so we
# provide deterministic smoke-prefixed ids (cleaned up in the trap).
psql "$DB" -q -c "INSERT INTO \"Notification\" (id,\"userId\",type,payload) VALUES
  ('${NOTIF_PREFIX}_a','$CUSTOMER_ID','REGISTRATION_CONFIRMATION','{\"kind\":\"smoke\"}'),
  ('${NOTIF_PREFIX}_b','$CUSTOMER_ID','REGISTRATION_CONFIRMATION','{\"kind\":\"smoke\"}');" >/dev/null
echo "inserted 2 customer-owned notifications: ${NOTIF_PREFIX}_a, ${NOTIF_PREFIX}_b"

# Grab a known staff-queue (userId:null) notification id to assert it never leaks
# into the customer feed and 404s when the customer tries to mark it read.
STAFF_ID=$(psql "$DB" -tAc "SELECT id FROM \"Notification\" WHERE \"userId\" IS NULL ORDER BY \"createdAt\" DESC LIMIT 1;")
test -n "$STAFF_ID" || { echo "FAIL: no userId:null staff-queue notification found in $DB"; exit 1; }
echo "staff-queue notification under test: $STAFF_ID"

# ===========================================================================
echo
echo "== 2) admin: sees shared staff queue; read-all zeroes unread-count =="
# Confirm the admin feed includes the shared userId:null row.
curl -s "$BASE/notifications?pageSize=100" -H "Authorization: Bearer $ATOK" | python3 -c '
import sys, json
r = json.load(sys.stdin)
ids = [x["id"] for x in r["data"]]
assert sys.argv[1] in ids, "admin feed missing shared staff-queue row %s" % sys.argv[1]
assert r["total"] >= 1
print("admin feed includes staff-queue row", sys.argv[1], "| total", r["total"])' "$STAFF_ID"

# Capture the staff-queue unread ids we are about to mark, so the trap can restore them.
STAFF_MARKED_IDS=$(psql "$DB" -tAc "SELECT string_agg(quote_literal(id), ',') FROM \"Notification\" WHERE \"userId\" IS NULL AND \"readAt\" IS NULL;")

UC=$(curl -s "$BASE/notifications/unread-count" -H "Authorization: Bearer $ATOK")
UC_N=$(jget "$UC" 'd["count"]')
echo "admin unread-count before read-all -> $UC_N"
test "$UC_N" -gt 0 || { echo "FAIL: expected admin unread-count > 0 (staff queue has unread rows)"; exit 1; }

RA=$(curl -s -X PATCH "$BASE/notifications/read-all" -H "Authorization: Bearer $ATOK")
RA_N=$(jget "$RA" 'd["updated"]')
echo "PATCH /notifications/read-all -> {updated: $RA_N}"
test "$RA_N" -ge 1 || { echo "FAIL: read-all updated 0 rows"; exit 1; }

UC2=$(curl -s "$BASE/notifications/unread-count" -H "Authorization: Bearer $ATOK")
UC2_N=$(jget "$UC2" 'd["count"]')
echo "admin unread-count after read-all -> $UC2_N"
test "$UC2_N" = "0" || { echo "FAIL: expected unread-count 0 after read-all, got $UC2_N"; exit 1; }
echo "OK (admin sees staff queue; read-all -> {updated:$RA_N}; unread-count -> 0)"

# ===========================================================================
echo
echo "== 3) customer: sees ONLY own rows; no staff-queue leak; unread-count matches =="
OWN_COUNT=$(psql "$DB" -tAc "SELECT count(*) FROM \"Notification\" WHERE \"userId\"='$CUSTOMER_ID';")
curl -s "$BASE/notifications?pageSize=100" -H "Authorization: Bearer $CTOK" | python3 -c '
import sys, json
r = json.load(sys.stdin)
own_count = int(sys.argv[1]); staff_id = sys.argv[2]
ids = [x["id"] for x in r["data"]]
assert r["total"] == own_count, "customer total %d != own-row count %d" % (r["total"], own_count)
assert staff_id not in ids, "STAFF-QUEUE LEAK: %s appeared in customer feed" % staff_id
print("customer feed: total", r["total"], "== own rows", own_count, "| no staff-queue leak")' "$OWN_COUNT" "$STAFF_ID"

OWN_UNREAD=$(psql "$DB" -tAc "SELECT count(*) FROM \"Notification\" WHERE \"userId\"='$CUSTOMER_ID' AND \"readAt\" IS NULL;")
CUC=$(curl -s "$BASE/notifications/unread-count" -H "Authorization: Bearer $CTOK")
CUC_N=$(jget "$CUC" 'd["count"]')
echo "customer unread-count -> $CUC_N (psql own-unread: $OWN_UNREAD)"
test "$CUC_N" = "$OWN_UNREAD" || { echo "FAIL: customer unread-count $CUC_N != own unread $OWN_UNREAD"; exit 1; }
echo "OK (customer sees only own rows; unread-count matches own unread)"

# ===========================================================================
echo
echo "== 4) mark-read semantics (own row 204 + idempotent; not-visible/absent 404) =="
OWN_ID="${NOTIF_PREFIX}_a"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/notifications/$OWN_ID/read" -H "Authorization: Bearer $CTOK")
echo "PATCH /notifications/$OWN_ID/read (own row) -> HTTP $CODE"
test "$CODE" = "204" || { echo "FAIL: expected 204, got $CODE"; exit 1; }
READAT=$(psql "$DB" -tAc "SELECT \"readAt\" IS NOT NULL FROM \"Notification\" WHERE id='$OWN_ID';")
test "$READAT" = "t" || { echo "FAIL: readAt not set on $OWN_ID"; exit 1; }
echo "psql: readAt set on $OWN_ID"

CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/notifications/$OWN_ID/read" -H "Authorization: Bearer $CTOK")
echo "PATCH same id again (idempotent) -> HTTP $CODE"
test "$CODE" = "204" || { echo "FAIL: expected idempotent 204, got $CODE"; exit 1; }

# Customer PATCHing a staff-queue (userId:null) row it cannot see -> 404.
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/notifications/$STAFF_ID/read" -H "Authorization: Bearer $CTOK")
echo "PATCH staff-queue id as customer (not visible) -> HTTP $CODE"
test "$CODE" = "404" || { echo "FAIL: expected 404 on not-visible id, got $CODE"; exit 1; }

# Absent id -> 404 (also proves ':id/read' didn't shadow 'read-all').
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/notifications/does_not_exist_${TS}/read" -H "Authorization: Bearer $CTOK")
echo "PATCH absent id -> HTTP $CODE"
test "$CODE" = "404" || { echo "FAIL: expected 404 on absent id, got $CODE"; exit 1; }
echo "OK (own 204 + idempotent; not-visible 404; absent 404)"

# ===========================================================================
echo
echo "== 5) ?unread=true excludes the row we just marked read =="
# Customer has 2 own rows; _a is now read, _b still unread. unread=true -> only _b.
curl -s "$BASE/notifications?unread=true&pageSize=100" -H "Authorization: Bearer $CTOK" | python3 -c '
import sys, json
r = json.load(sys.stdin)
read_id = sys.argv[1]; unread_id = sys.argv[2]
ids = [x["id"] for x in r["data"]]
assert read_id not in ids, "read row %s still in unread feed" % read_id
assert unread_id in ids, "unread row %s missing from unread feed" % unread_id
for x in r["data"]:
    assert x["readAt"] is None, "unread feed returned a read row: %s" % x["id"]
print("unread feed: excludes read", read_id, "| includes unread", unread_id, "| all readAt None")' "${NOTIF_PREFIX}_a" "${NOTIF_PREFIX}_b"
echo "OK (?unread=true filters to unread only)"

echo
echo "ALL NOTIFICATION SMOKE CHECKS PASSED"
