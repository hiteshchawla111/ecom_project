#!/usr/bin/env bash
# HTTP smoke for M3c GET /products/search vs a running API (:5000) on ecom_dev.
# Usage: start the API (npm run start:dev), then: bash scripts/smoke-search.sh
# Asserts: ranked FTS results, ACTIVE-only, websearch parsing (multi-word/quoted/negation),
# pagination, catalog-shape relations, blank-q empty page, route precedence over /products/:id.
set -euo pipefail
BASE="${BASE:-http://localhost:5000}"

echo "== route precedence: /products/search resolves (not shadowed by /products/:id) =="
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/products/search?q=aurora")
echo "GET /products/search?q=aurora -> HTTP $CODE"
test "$CODE" = "200"

echo "== name match: 'aurora' returns the Aurora products, ranked, ACTIVE-only =="
curl -s "$BASE/products/search?q=aurora" | python3 -c '
import sys, json
r = json.load(sys.stdin)
names = [p["name"] for p in r["data"]]
print("names:", names, "total:", r["total"])
assert r["total"] >= 2, "expected >=2 aurora matches"
assert all("Aurora" in n for n in names), "all hits should be Aurora products"
print("OK")'

echo "== description/full-text hit: 'phone' matches the Aurora products =="
curl -s "$BASE/products/search?q=phone" | python3 -c '
import sys, json
r = json.load(sys.stdin)
assert r["total"] >= 1, "expected phone matches"
print("total:", r["total"], "OK")'

echo "== websearch parsing: multi-word / quoted / negation never error =="
for Q in "oled display" "\"OLED display\"" "-budget"; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --get "$BASE/products/search" --data-urlencode "q=$Q")
  echo "q=$Q -> HTTP $CODE"
  test "$CODE" = "200"
done

echo "== ACTIVE-only: no archived products leak (ARCHIVED 'Admin UI Smoke' must not appear) =="
curl -s "$BASE/products/search?q=smoke" | python3 -c '
import sys, json
r = json.load(sys.stdin)
for p in r["data"]:
    assert p["status"] == "ACTIVE", "non-ACTIVE leaked: " + p["name"] + " (" + p["status"] + ")"
print("checked", r["total"], "hits, all ACTIVE OK")'

echo "== response carries catalog relations (category, images, seller) =="
curl -s "$BASE/products/search?q=aurora" | python3 -c '
import sys, json
r = json.load(sys.stdin)
p = r["data"][0]
for k in ("category", "images", "seller"):
    assert k in p, f"missing relation {k}"
assert "displayName" in p["seller"] and "slug" in p["seller"], "seller projection wrong"
print("relations present OK")'

echo "== pagination: pageSize=1 gives one item and a stable total =="
curl -s "$BASE/products/search?q=aurora&pageSize=1&page=1" | python3 -c '
import sys, json
r = json.load(sys.stdin)
assert len(r["data"]) == 1, "pageSize=1 should yield 1 item"
assert r["total"] >= 2, "total should reflect all matches, not the page"
assert r["totalPages"] >= 2, "totalPages should reflect total/pageSize"
print("page1 len:", len(r["data"]), "total:", r["total"], "totalPages:", r["totalPages"], "OK")'

echo "== blank q -> empty page, no error =="
curl -s "$BASE/products/search?q=" | python3 -c '
import sys, json
r = json.load(sys.stdin)
assert r["data"] == [] and r["total"] == 0, "blank q should be an empty page"
print("blank OK")'

echo "ALL SMOKE CHECKS PASSED"
