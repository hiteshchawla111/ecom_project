/*
  Warnings:

  - A unique constraint covering the columns `[sku,sellerId]` on the table `Product` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Product_sku_key";

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_sellerId_key" ON "Product"("sku", "sellerId");
