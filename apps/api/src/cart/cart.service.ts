import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CartTotals,
  TotalsConfig,
  TotalsLine,
  centsToString,
  computeTotals,
} from './totals';
import { resolveTotalsConfig } from './cart.config';

/** One line as returned to the client. */
export interface CartItemView {
  productId: string;
  name: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  image: string | null;
}

/** The cart-with-totals envelope every endpoint returns. */
export interface CartView {
  id: string;
  items: CartItemView[];
  totals: CartTotals;
}

/** Cart → items → product (price/status/name) + ordered images. */
const CART_INCLUDE = {
  items: {
    include: {
      product: {
        include: { images: { orderBy: { position: 'asc' as const } } },
      },
    },
  },
} satisfies Prisma.CartInclude;

type CartWithItems = Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>;

/** Effective unit price in integer cents: sale price when strictly below regular. */
function effectiveUnitCents(price: string, salePrice: string | null): number {
  const regular = Math.round(Number(price) * 100);
  if (salePrice === null) return regular;
  const sale = Math.round(Number(salePrice) * 100);
  return sale < regular ? sale : regular;
}

@Injectable()
export class CartService {
  private readonly totalsConfig: TotalsConfig;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.totalsConfig = resolveTotalsConfig(config);
  }

  async getCart(userId: string): Promise<CartView> {
    const cart = await this.getOrCreateCart(userId);
    return this.buildEnvelope(cart);
  }

  /** Find the user's cart (with items) or create an empty one. */
  protected async getOrCreateCart(userId: string): Promise<CartWithItems> {
    const existing = await this.prisma.cart.findFirst({
      where: { userId },
      include: CART_INCLUDE,
    });
    if (existing) return existing;
    return this.prisma.cart.create({
      data: { userId },
      include: CART_INCLUDE,
    });
  }

  /** Map a loaded cart → priced envelope via the pure totals pipeline. */
  protected buildEnvelope(cart: CartWithItems): CartView {
    const items: CartItemView[] = [];
    const lines: TotalsLine[] = [];

    for (const item of cart.items) {
      const unitCents = effectiveUnitCents(
        item.product.price.toString(),
        item.product.salePrice ? item.product.salePrice.toString() : null,
      );
      const lineCents = unitCents * item.quantity;
      lines.push({ unitPriceCents: unitCents, quantity: item.quantity });
      items.push({
        productId: item.productId,
        name: item.product.name,
        unitPrice: centsToString(unitCents),
        quantity: item.quantity,
        lineTotal: centsToString(lineCents),
        image: item.product.images[0]?.url ?? null,
      });
    }

    return {
      id: cart.id,
      items,
      totals: computeTotals(lines, this.totalsConfig),
    };
  }

  /** Load an ACTIVE product or throw: 404 if absent, 400 if not purchasable. */
  protected async requirePurchasableProduct(productId: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.status !== ProductStatus.ACTIVE) {
      throw new BadRequestException('Product is not available for purchase');
    }
  }
}
