#!/usr/bin/env bash
# HTTP smoke for M4a Reviews vs a running API (:5000) on ecom_dev.
# Usage: start the API (npm run start:dev), then: bash scripts/smoke-reviews.sh
#
# Covers, against real seeded data (creates its own throwaway customers + orders):
#   1. delivered-purchase gate 403      2. verified review create + no-PII author
#   3. one-per-product 409              4. rating DTO 400 + DB CHECK constraint
#   5. public list summary/distribution + nextCursor paging
#   6. product aggregate moved (ratingAvg/ratingCount)
#   7. admin list filter + non-admin 403
#   8. admin hide -> 204 (idempotent), disappears, aggregate drops, audit row
#   9. admin unhide -> 204, reappears, aggregate restored, audit row
#
# Requires: a fresh API serving the /reviews routes, psql access to ecom_dev,
# admin seed user (admin@example.com / Password123!), and a stocked ACTIVE product.
set -euo pipefail

BASE="${BASE:-http://localhost:5000}"
DB="${DB:-ecom_dev}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Password123!}"
PASSWORD="Password123!"
TS="$(date +%s)_$$"

# --- helpers ---------------------------------------------------------------

# jget <json> <python-expr on d>  -> prints the evaluated value
jget() { python3 -c 'import sys,json; d=json.load(sys.stdin); print(eval(sys.argv[1]))' "$2" <<<"$1"; }

# login/register returns {accessToken, refreshToken}
token_of() { jget "$1" 'd["accessToken"]'; }

register_customer() { # <email>
  # Name is a clean human name (never the email) so the no-PII assertion below
  # tests the projection, not the fixture. The API projects author name only.
  curl -s -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\",\"name\":\"Smoke Tester\"}"
}

login() { # <email> <password>
  curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}"
}

# Give a customer a DELIVERED order for $PID by driving the real state machine:
#   add to cart -> place order (PENDING) -> admin PATCHes to DELIVERED.
deliver_order() { # <customer-token> <admin-token>
  local ctok="$1" atok="$2" ord oid s code
  curl -s -o /dev/null -X POST "$BASE/cart/items" -H "Authorization: Bearer $ctok" \
    -H 'Content-Type: application/json' -d "{\"productId\":\"$PID\",\"quantity\":1}"
  ord=$(curl -s -X POST "$BASE/orders" -H "Authorization: Bearer $ctok" \
    -H 'Content-Type: application/json' \
    -d '{"shipFullName":"Smoke","shipLine1":"1 St","shipCity":"NYC","shipState":"NY","shipCountry":"US","shipPostalCode":"10001"}')
  oid=$(jget "$ord" 'd["id"]')
  for s in CONFIRMED PROCESSING SHIPPED DELIVERED; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/orders/$oid/status" \
      -H "Authorization: Bearer $atok" -H 'Content-Type: application/json' \
      -d "{\"status\":\"$s\"}")
    test "$code" = "200" || { echo "FAIL: transition to $s -> HTTP $code"; exit 1; }
  done
}

# --- setup: pick a stocked ACTIVE product, log the admin in --------------------

echo "== setup: pick a stocked ACTIVE product =="
PID=$(psql "$DB" -tAc "SELECT p.id FROM \"Product\" p LEFT JOIN \"InventoryItem\" iv ON iv.\"productId\"=p.id WHERE p.status='ACTIVE' GROUP BY p.id HAVING COALESCE(SUM(iv.available),0) >= 3 ORDER BY p.id LIMIT 1;")
test -n "$PID" || { echo "FAIL: no stocked ACTIVE product found in $DB"; exit 1; }
echo "product under test: $PID"

# Clean any prior review state for this product so aggregate assertions are exact.
psql "$DB" -q -c "DELETE FROM \"Review\" WHERE \"productId\"='$PID';" >/dev/null
psql "$DB" -q -c "UPDATE \"Product\" SET \"ratingAvg\"=NULL, \"ratingCount\"=0 WHERE id='$PID';" >/dev/null

ATOK=$(token_of "$(login "$ADMIN_EMAIL" "$ADMIN_PASSWORD")")
test -n "$ATOK" || { echo "FAIL: admin login failed"; exit 1; }
echo "admin authenticated OK"

# =====================================================================
echo
echo "== 1) customer with NO delivered order -> POST review -> 403 =="
C_NONE=$(token_of "$(register_customer "smoke_none_${TS}@example.com")")
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/products/$PID/reviews" \
  -H "Authorization: Bearer $C_NONE" -H 'Content-Type: application/json' -d '{"rating":5}')
echo "POST /products/$PID/reviews (no delivered order) -> HTTP $CODE"
test "$CODE" = "403"
echo "OK (403 delivered-gate)"

# =====================================================================
echo
echo "== 2) customer WITH delivered order -> POST rating 5 -> success, isVerified:true, no email =="
C1_EMAIL="smoke_c1_${TS}@example.com"
C1=$(token_of "$(register_customer "$C1_EMAIL")")
deliver_order "$C1" "$ATOK"
RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/products/$PID/reviews" \
  -H "Authorization: Bearer $C1" -H 'Content-Type: application/json' \
  -d '{"rating":5,"title":"Great","body":"Loved it"}')
CODE=$(tail -n1 <<<"$RESP"); JSON=$(sed '$d' <<<"$RESP")
echo "POST rating 5 -> HTTP $CODE"
test "$CODE" = "201" -o "$CODE" = "200"
python3 -c '
import sys, json
d = json.loads(sys.argv[1])
email = sys.argv[2]
assert d.get("isVerified") is True, "expected isVerified:true, got %r" % d.get("isVerified")
blob = json.dumps(d)
assert "email" not in blob and email not in blob, "PII leak: response exposes email -> %s" % blob
assert "authorName" in d, "expected authorName projection"
print("created review id:", d["id"], "isVerified:", d["isVerified"], "author:", d["authorName"], "- no email OK")
' "$JSON" "$C1_EMAIL"
REVIEW_ID=$(jget "$JSON" 'd["id"]')

# =====================================================================
echo
echo "== 3) same customer POSTs again for same product -> 409 =="
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/products/$PID/reviews" \
  -H "Authorization: Bearer $C1" -H 'Content-Type: application/json' -d '{"rating":4}')
echo "POST again (same customer/product) -> HTTP $CODE"
test "$CODE" = "409"
echo "OK (409 one-per-product)"

# =====================================================================
echo
echo "== 4) rating 6 -> 400 (DTO) ; rating 0 via psql -> DB CHECK violation =="
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/products/$PID/reviews" \
  -H "Authorization: Bearer $C1" -H 'Content-Type: application/json' -d '{"rating":6}')
echo "POST rating 6 -> HTTP $CODE"
test "$CODE" = "400"
USER_ID=$(psql "$DB" -tAc "SELECT id FROM \"User\" WHERE email='smoke_c1_${TS}@example.com';")
# Insert rating 0 directly: must be rejected by the Review_rating_check constraint.
if psql "$DB" -v ON_ERROR_STOP=1 -c \
  "INSERT INTO \"Review\" (id,\"productId\",\"userId\",rating) VALUES ('chk_${TS}','$PID','$USER_ID',0);" >/dev/null 2>/tmp/chk_${TS}.err; then
  echo "FAIL: rating 0 INSERT was accepted (CHECK constraint missing!)"; exit 1
fi
if grep -qi 'Review_rating_check\|violates check constraint' /tmp/chk_${TS}.err; then
  echo "OK (DTO 400 + DB CHECK Review_rating_check rejected rating 0)"
else
  echo "FAIL: rating 0 rejected but not by the rating CHECK:"; cat /tmp/chk_${TS}.err; exit 1
fi
rm -f /tmp/chk_${TS}.err

# =====================================================================
echo
echo "== 5) public GET reviews -> review present; summary 5.00/1; distribution[5]=1; then cursor paging =="
curl -s "$BASE/products/$PID/reviews" | python3 -c '
import sys, json
r = json.load(sys.stdin)
assert len(r["data"]) == 1, "expected 1 visible review, got %d" % len(r["data"])
s = r["summary"]
assert s["ratingAvg"] == "5.00", "ratingAvg = %r (expected 5.00)" % s["ratingAvg"]
assert s["ratingCount"] == 1, "ratingCount = %r (expected 1)" % s["ratingCount"]
assert s["distribution"]["5"] == 1, "distribution[5] = %r (expected 1)" % s["distribution"]["5"]
blob = json.dumps(r).lower()
assert "email" not in blob and "@example.com" not in blob, "PII leak in public list"
print("public list: 1 review, avg", s["ratingAvg"], "count", s["ratingCount"], "dist5", s["distribution"]["5"], "- no PII OK")'

echo "-- add a 2nd delivered customer's review, then verify limit=1 nextCursor paging --"
C2=$(token_of "$(register_customer "smoke_c2_${TS}@example.com")")
deliver_order "$C2" "$ATOK"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/products/$PID/reviews" \
  -H "Authorization: Bearer $C2" -H 'Content-Type: application/json' -d '{"rating":3}')
test "$CODE" = "201" -o "$CODE" = "200"

PAGE1=$(curl -s "$BASE/products/$PID/reviews?limit=1")
CURSOR=$(python3 -c '
import sys, json
r = json.loads(sys.argv[1])
assert len(r["data"]) == 1, "limit=1 should return 1 item, got %d" % len(r["data"])
assert r["nextCursor"], "expected a nextCursor when more remain"
print(r["nextCursor"])' "$PAGE1")
echo "page1 (limit=1): 1 item, nextCursor present"
curl -s --get "$BASE/products/$PID/reviews" --data-urlencode "limit=1" --data-urlencode "cursor=$CURSOR" | python3 -c '
import sys, json
r = json.load(sys.stdin)
assert len(r["data"]) == 1, "page2 should return the 2nd item"
assert r["nextCursor"] is None, "no cursor expected after the last item, got %r" % r["nextCursor"]
print("page2 (cursor): 1 item, nextCursor None - paging OK")'

# =====================================================================
echo
echo "== 6) GET /products/:id shows the moved aggregate (2 reviews: 5 + 3 -> avg 4, count 2) =="
# Note: the product endpoint serializes the Prisma Decimal(3,2) as "4" (trailing
# zeros stripped by Decimal.toJSON); the reviews summary uses .toFixed(2) -> "4.00".
# Same stored value (DB holds 4.00) — assert numerically to tolerate both forms.
curl -s "$BASE/products/$PID" | python3 -c '
import sys, json
p = json.load(sys.stdin)
assert float(p["ratingAvg"]) == 4.0, "product ratingAvg = %r (expected 4)" % p["ratingAvg"]
assert p["ratingCount"] == 2, "product ratingCount = %r (expected 2)" % p["ratingCount"]
print("product aggregate: avg", p["ratingAvg"], "count", p["ratingCount"], "OK")'

# =====================================================================
echo
echo "== 7) admin GET /admin/reviews?isHidden=false lists it; non-admin -> 403 =="
curl -s "$BASE/admin/reviews?productId=$PID&isHidden=false" -H "Authorization: Bearer $ATOK" | python3 -c '
import sys, json
r = json.load(sys.stdin)
for k in ("data","page","pageSize","total"):
    assert k in r, "admin list missing key %s" % k
assert r["total"] >= 2, "expected >=2 visible reviews, got %d" % r["total"]
print("admin list: total", r["total"], "page", r["page"], "pageSize", r["pageSize"], "OK")'
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/reviews" -H "Authorization: Bearer $C1")
echo "non-admin GET /admin/reviews -> HTTP $CODE"
test "$CODE" = "403"
echo "OK (admin list + non-admin 403)"

# =====================================================================
echo
echo "== 8) admin PATCH .../hide -> 204; disappears; ratingCount drops; audit row; idempotent =="
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/admin/reviews/$REVIEW_ID/hide" -H "Authorization: Bearer $ATOK")
echo "PATCH hide -> HTTP $CODE"
test "$CODE" = "204"
# The hidden (rating 5) review must no longer be public; aggregate = the remaining rating-3 review.
curl -s "$BASE/products/$PID/reviews" | python3 -c '
import sys, json
r = json.load(sys.stdin)
ids = [x["id"] for x in r["data"]]
assert "'"$REVIEW_ID"'" not in ids, "hidden review still visible"
assert r["summary"]["ratingCount"] == 1, "count after hide = %r (expected 1)" % r["summary"]["ratingCount"]
assert r["summary"]["ratingAvg"] == "3.00", "avg after hide = %r (expected 3.00)" % r["summary"]["ratingAvg"]
print("after hide: hidden review gone, avg", r["summary"]["ratingAvg"], "count", r["summary"]["ratingCount"], "OK")'
N=$(psql "$DB" -tAc "SELECT count(*) FROM \"AuditLog\" WHERE action='review.hidden' AND \"entityId\"='$REVIEW_ID' AND \"entityType\"='Review';")
test "$N" -ge 1 || { echo "FAIL: no review.hidden AuditLog row"; exit 1; }
echo "AuditLog review.hidden rows: $N OK"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/admin/reviews/$REVIEW_ID/hide" -H "Authorization: Bearer $ATOK")
echo "PATCH hide again (idempotent) -> HTTP $CODE"
test "$CODE" = "204"
echo "OK (hide 204, disappears, aggregate drops, audit row, idempotent)"

# =====================================================================
echo
echo "== 9) admin PATCH .../unhide -> 204; reappears; aggregate restored; audit row =="
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/admin/reviews/$REVIEW_ID/unhide" -H "Authorization: Bearer $ATOK")
echo "PATCH unhide -> HTTP $CODE"
test "$CODE" = "204"
curl -s "$BASE/products/$PID/reviews" | python3 -c '
import sys, json
r = json.load(sys.stdin)
ids = [x["id"] for x in r["data"]]
assert "'"$REVIEW_ID"'" in ids, "unhidden review not visible again"
assert r["summary"]["ratingCount"] == 2, "count after unhide = %r (expected 2)" % r["summary"]["ratingCount"]
assert r["summary"]["ratingAvg"] == "4.00", "avg after unhide = %r (expected 4.00)" % r["summary"]["ratingAvg"]
print("after unhide: review back, avg", r["summary"]["ratingAvg"], "count", r["summary"]["ratingCount"], "OK")'
N=$(psql "$DB" -tAc "SELECT count(*) FROM \"AuditLog\" WHERE action='review.unhidden' AND \"entityId\"='$REVIEW_ID' AND \"entityType\"='Review';")
test "$N" -ge 1 || { echo "FAIL: no review.unhidden AuditLog row"; exit 1; }
echo "AuditLog review.unhidden rows: $N OK"
echo "OK (unhide 204, reappears, aggregate restored, audit row)"

echo
echo "ALL REVIEW SMOKE CHECKS PASSED"
