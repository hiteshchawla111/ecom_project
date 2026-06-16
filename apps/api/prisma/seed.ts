import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient, ProductStatus, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg(process.env.DATABASE_URL as string);
const prisma = new PrismaClient({ adapter });

/**
 * Idempotent seed: sample category hierarchy + products with inventory.
 * Safe to re-run (upserts on unique slug/sku). Dev convenience only.
 */
async function main(): Promise<void> {
  // Category hierarchy: Electronics > Phones, Electronics > Laptops
  const electronics = await prisma.category.upsert({
    where: { slug: 'electronics' },
    update: {},
    create: { name: 'Electronics', slug: 'electronics' },
  });

  const phones = await prisma.category.upsert({
    where: { slug: 'phones' },
    update: {},
    create: { name: 'Phones', slug: 'phones', parentId: electronics.id },
  });

  await prisma.category.upsert({
    where: { slug: 'laptops' },
    update: {},
    create: { name: 'Laptops', slug: 'laptops', parentId: electronics.id },
  });

  // Sample products with inventory.
  const products = [
    {
      sku: 'PH-001',
      name: 'Aurora Smartphone X',
      description: 'Flagship phone with OLED display.',
      price: '799.00',
      salePrice: '699.00',
      brand: 'Aurora',
      categoryId: phones.id,
      available: 25,
      lowStockThreshold: 5,
    },
    {
      sku: 'PH-002',
      name: 'Aurora Smartphone Lite',
      description: 'Budget-friendly everyday phone.',
      price: '349.00',
      salePrice: null,
      brand: 'Aurora',
      categoryId: phones.id,
      available: 3,
      lowStockThreshold: 5,
    },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        sku: p.sku,
        name: p.name,
        description: p.description,
        price: p.price,
        salePrice: p.salePrice ?? undefined,
        brand: p.brand,
        status: ProductStatus.ACTIVE,
        categoryId: p.categoryId,
      },
    });

    await prisma.inventoryItem.upsert({
      where: { productId: product.id },
      update: {},
      create: {
        productId: product.id,
        available: p.available,
        reserved: 0,
        lowStockThreshold: p.lowStockThreshold,
      },
    });
  }

  // Dev users for each internal role (idempotent). Password: "Password123!".
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const devUsers = [
    { email: 'admin@example.com', name: 'Admin User', role: Role.ADMIN },
    {
      email: 'inventory@example.com',
      name: 'Inventory Manager',
      role: Role.INVENTORY_MANAGER,
    },
  ];
  for (const u of devUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash,
      },
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
