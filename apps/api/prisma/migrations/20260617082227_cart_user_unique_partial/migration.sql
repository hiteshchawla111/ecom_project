-- Partial unique index: enforces at most one cart per authenticated user
-- while still allowing multiple guest carts (userId IS NULL).
CREATE UNIQUE INDEX "Cart_userId_unique_not_null" ON "Cart"("userId") WHERE "userId" IS NOT NULL;
