import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CartTotals, TotalsConfig } from './totals';
import { resolveTotalsConfig } from './cart.config';
import { priceItems } from './cart-pricing';

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

  async addItem(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartView> {
    const cart = await this.getOrCreateCart(userId);
    await this.requirePurchasableProduct(productId);
    await this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId } },
      create: { cartId: cart.id, productId, quantity },
      update: { quantity: { increment: quantity } },
    });
    return this.getCart(userId);
  }

  async setItemQuantity(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartView> {
    const cart = await this.getOrCreateCart(userId);
    if (quantity === 0) {
      await this.prisma.cartItem.deleteMany({
        where: { cartId: cart.id, productId },
      });
      return this.getCart(userId);
    }
    await this.requirePurchasableProduct(productId);
    try {
      await this.prisma.cartItem.update({
        where: { cartId_productId: { cartId: cart.id, productId } },
        data: { quantity },
      });
    } catch (err) {
      throw this.mapWriteError(err);
    }
    return this.getCart(userId);
  }

  async removeItem(userId: string, productId: string): Promise<CartView> {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id, productId },
    });
    return this.getCart(userId);
  }

  async clear(userId: string): Promise<CartView> {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.getCart(userId);
  }

  /** Find the user's cart (with items) or create an empty one.
   * Tolerates a P2002 unique violation from a concurrent first-touch request:
   * re-reads and returns the cart the other request created. */
  protected async getOrCreateCart(userId: string): Promise<CartWithItems> {
    const existing = await this.prisma.cart.findFirst({
      where: { userId },
      include: CART_INCLUDE,
    });
    if (existing) return existing;
    try {
      return await this.prisma.cart.create({
        data: { userId },
        include: CART_INCLUDE,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Another concurrent request created the cart first; re-read it.
        const raced = await this.prisma.cart.findFirst({
          where: { userId },
          include: CART_INCLUDE,
        });
        if (raced) return raced;
      }
      throw err;
    }
  }

  /** Map a loaded cart → priced envelope via the shared pricer. */
  protected buildEnvelope(cart: CartWithItems): CartView {
    const { lines, totals } = priceItems(
      cart.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        product: {
          name: item.product.name,
          price: item.product.price.toString(),
          salePrice:
            item.product.salePrice !== null
              ? item.product.salePrice.toString()
              : null,
        },
        imageUrl: item.product.images[0]?.url ?? null,
      })),
      this.totalsConfig,
    );

    return {
      id: cart.id,
      items: lines.map((line) => ({
        productId: line.productId,
        name: line.name,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        lineTotal: line.lineTotal,
        image: line.imageUrl,
      })),
      totals,
    };
  }

  /** Translates known Prisma write errors into HTTP-meaningful exceptions. */
  private mapWriteError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') {
        return new NotFoundException('Cart item not found');
      }
      if (err.code === 'P2003') {
        return new BadRequestException('Referenced product does not exist');
      }
    }
    return err instanceof Error ? err : new Error('Unknown error');
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
