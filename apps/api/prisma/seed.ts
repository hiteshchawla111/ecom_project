import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient, ProductStatus, Role, SellerStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg(process.env.DATABASE_URL as string);
const prisma = new PrismaClient({ adapter });

/**
 * Idempotent seed: sample category hierarchy + products with inventory.
 * Safe to re-run (idempotent upserts/guarded creates). Dev convenience only.
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

  // Platform seller — the default owner for seeded + backfilled products/inventory (M2).
  // Resolved before the product loop so seeded products can be owned at creation.
  const adminUser = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@example.com' },
  });
  const platformSeller = await prisma.seller.upsert({
    where: { userId: adminUser.id },
    update: {},
    create: {
      userId: adminUser.id,
      displayName: 'Platform',
      slug: 'platform',
      status: SellerStatus.ACTIVE,
    },
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
      imageUrl:
        'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&h=600&q=80',
      imageAlt: 'Aurora Smartphone X front and back',
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
      imageUrl:
        'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=600&h=600&q=80',
      imageAlt: 'Aurora Smartphone Lite held in hand',
    },
  ];

  for (const p of products) {
    // sku is no longer globally unique (B5: @@unique([sku, sellerId])), so guard
    // on (sku, sellerId) instead of upserting by sku alone.
    let product = await prisma.product.findFirst({
      where: { sku: p.sku, sellerId: platformSeller.id },
    });
    if (!product) {
      product = await prisma.product.create({
        data: {
          sku: p.sku,
          name: p.name,
          description: p.description,
          price: p.price,
          salePrice: p.salePrice ?? undefined,
          brand: p.brand,
          status: ProductStatus.ACTIVE,
          categoryId: p.categoryId,
          sellerId: platformSeller.id,
        },
      });
    }

    await prisma.inventoryItem.upsert({
      where: { productId: product.id },
      update: {},
      create: {
        productId: product.id,
        available: p.available,
        reserved: 0,
        lowStockThreshold: p.lowStockThreshold,
        sellerId: platformSeller.id,
      },
    });

    // Seed a primary image (idempotent: only when the product has none yet).
    // ProductImage has no natural unique key, so guard on an existing count.
    const imageCount = await prisma.productImage.count({
      where: { productId: product.id },
    });
    if (imageCount === 0) {
      await prisma.productImage.create({
        data: {
          productId: product.id,
          url: p.imageUrl,
          alt: p.imageAlt,
          position: 0,
        },
      });
    }
  }

  // Default brand hue (coral, matches DESIGN.md primary-500). Idempotent.
  await prisma.appSetting.upsert({
    where: { key: 'brand.hue' },
    update: {},
    create: { key: 'brand.hue', value: '28' },
  });
  // Demo seller — a self-serve SELLER account for the seller portal (M2 slice 6).
  const sellerUser = await prisma.user.upsert({
    where: { email: 'seller@example.com' },
    update: {},
    create: {
      email: 'seller@example.com',
      name: 'Demo Seller',
      role: Role.SELLER,
      passwordHash,
    },
  });
  const demoSeller = await prisma.seller.upsert({
    where: { userId: sellerUser.id },
    update: {},
    create: {
      userId: sellerUser.id,
      displayName: 'Demo Shop',
      slug: 'demo-shop',
      status: SellerStatus.ACTIVE,
    },
  });

  // A couple of products owned by the demo seller (idempotent: findFirst-guarded
  // create scoped to this seller, mirroring the platform-seller product loop).
  const demoProducts = [
    { sku: 'DEMO-001', name: 'Demo Mug', description: 'A sturdy ceramic mug.', price: '12.00', available: 30, lowStockThreshold: 5 },
    { sku: 'DEMO-002', name: 'Demo Notebook', description: 'A5 dotted notebook.', price: '8.50', available: 3, lowStockThreshold: 5 },
  ];
  for (const p of demoProducts) {
    let product = await prisma.product.findFirst({
      where: { sku: p.sku, sellerId: demoSeller.id },
    });
    if (!product) {
      product = await prisma.product.create({
        data: {
          sku: p.sku,
          name: p.name,
          description: p.description,
          price: p.price,
          status: ProductStatus.ACTIVE,
          categoryId: phones.id,
          sellerId: demoSeller.id,
        },
      });
    }
    const invCount = await prisma.inventoryItem.count({
      where: { productId: product.id },
    });
    if (invCount === 0) {
      await prisma.inventoryItem.create({
        data: {
          productId: product.id,
          available: p.available,
          reserved: 0,
          lowStockThreshold: p.lowStockThreshold,
          sellerId: demoSeller.id,
        },
      });
    }
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
