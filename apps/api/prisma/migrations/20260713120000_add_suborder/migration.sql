-- CreateEnum
CREATE TYPE "SubOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED');

-- CreateTable
CREATE TABLE "SubOrder" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "status" "SubOrderStatus" NOT NULL DEFAULT 'PENDING',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shippingTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(12,2) NOT NULL,
    "shipFullName" TEXT NOT NULL,
    "shipLine1" TEXT NOT NULL,
    "shipLine2" TEXT,
    "shipCity" TEXT NOT NULL,
    "shipState" TEXT NOT NULL,
    "shipCountry" TEXT NOT NULL,
    "shipPostalCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubOrderItem" (
    "id" TEXT NOT NULL,
    "subOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "sellerName" TEXT NOT NULL,
    CONSTRAINT "SubOrderItem_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN "subOrderId" TEXT;

-- CreateIndex
CREATE INDEX "SubOrder_orderId_idx" ON "SubOrder"("orderId");
CREATE INDEX "SubOrder_sellerId_status_createdAt_idx" ON "SubOrder"("sellerId", "status", "createdAt");
CREATE INDEX "SubOrder_status_idx" ON "SubOrder"("status");
CREATE INDEX "SubOrderItem_subOrderId_idx" ON "SubOrderItem"("subOrderId");
CREATE INDEX "SubOrderItem_productId_idx" ON "SubOrderItem"("productId");
CREATE INDEX "InventoryMovement_subOrderId_idx" ON "InventoryMovement"("subOrderId");

-- AddForeignKey
ALTER TABLE "SubOrder" ADD CONSTRAINT "SubOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubOrder" ADD CONSTRAINT "SubOrder_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubOrderItem" ADD CONSTRAINT "SubOrderItem_subOrderId_fkey" FOREIGN KEY ("subOrderId") REFERENCES "SubOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
