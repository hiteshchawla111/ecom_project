-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "sellerId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "sellerId" TEXT;

-- CreateIndex
CREATE INDEX "InventoryItem_sellerId_idx" ON "InventoryItem"("sellerId");

-- CreateIndex
CREATE INDEX "Product_sellerId_idx" ON "Product"("sellerId");
