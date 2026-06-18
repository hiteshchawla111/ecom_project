import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, Prisma, ProductStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth/auth-tokens';
import { InventoryService } from '../inventory/inventory.service';
import { resolveTotalsConfig } from '../cart/cart.config';
import { priceItems, PricingItem } from '../cart/cart-pricing';
import { TotalsConfig } from '../cart/totals';
import {
  assertTransition,
  InvalidOrderTransitionError,
  OrderStatus as OrderStatusFlow,
} from './order-status';
import { CheckoutDto } from './dto/checkout.dto';
import { ListOrdersDto } from './dto/list-orders.dto';

/** Format a money value (Prisma Decimal, string, or number) as a 2-dp string. */
function money(value: Prisma.Decimal | string | number): string {
  return new Prisma.Decimal(value).toFixed(2);
}

export interface OrderItemView {
  productId: string;
  productName: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

export interface OrderView {
  id: string;
  status: OrderStatus;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  shippingTotal: string;
  grandTotal: string;
  shipFullName: string;
  shipLine1: string;
  shipLine2: string | null;
  shipCity: string;
  shipState: string;
  shipCountry: string;
  shipPostalCode: string;
  items: OrderItemView[];
  createdAt: Date;
}

export interface OrderSummary {
  id: string;
  status: OrderStatus;
  grandTotal: string;
  itemCount: number;
  createdAt: Date;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Cart load for placement: items + the product fields the pricer + validation need. */
const CART_FOR_CHECKOUT = {
  items: {
    include: {
      product: {
        select: {
          name: true,
          price: true,
          salePrice: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

/** Order load shape for views. */
export const ORDER_INCLUDE = { items: true } satisfies Prisma.OrderInclude;
type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

@Injectable()
export class OrdersService {
  private readonly totalsConfig: TotalsConfig;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    private readonly inventory: InventoryService,
  ) {
    this.totalsConfig = resolveTotalsConfig(config);
  }

  async placeOrder(userId: string, dto: CheckoutDto): Promise<OrderView> {
    const cart = await this.prisma.cart.findFirst({
      where: { userId },
      include: CART_FOR_CHECKOUT,
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }

    // Re-validate each line and build pricer input from current product data.
    const pricingItems: PricingItem[] = cart.items.map((item) => {
      const p = item.product;
      if (p.deletedAt !== null || p.status !== ProductStatus.ACTIVE) {
        throw new BadRequestException(
          `'${p.name}' is no longer available; remove it to checkout`,
        );
      }
      return {
        productId: item.productId,
        quantity: item.quantity,
        product: {
          name: p.name,
          price: p.price.toString(),
          salePrice: p.salePrice !== null ? p.salePrice.toString() : null,
        },
      };
    });

    const { lines, totals } = priceItems(pricingItems, this.totalsConfig);

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          taxTotal: totals.taxTotal,
          shippingTotal: totals.shippingTotal,
          grandTotal: totals.grandTotal,
          shipFullName: dto.shipFullName,
          shipLine1: dto.shipLine1,
          shipLine2: dto.shipLine2 ?? null,
          shipCity: dto.shipCity,
          shipState: dto.shipState,
          shipCountry: dto.shipCountry,
          shipPostalCode: dto.shipPostalCode,
          items: {
            create: lines.map((line) => ({
              productId: line.productId,
              productName: line.name,
              unitPrice: line.unitPrice,
              quantity: line.quantity,
              lineTotal: line.lineTotal,
            })),
          },
        },
        include: ORDER_INCLUDE,
      });
      // Reserve stock for each line within the same transaction: any failure
      // (insufficient stock or no inventory item) rolls back the whole order.
      for (const line of lines) {
        await this.inventory.reserve(
          line.productId,
          line.quantity,
          created.id,
          tx,
        );
      }
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      return created;
    });

    return this.toOrderView(order);
  }

  /** Map a loaded order (Prisma Decimals) → the string-money view. */
  protected toOrderView(order: OrderWithItems): OrderView {
    return {
      id: order.id,
      status: order.status,
      subtotal: money(order.subtotal),
      discountTotal: money(order.discountTotal),
      taxTotal: money(order.taxTotal),
      shippingTotal: money(order.shippingTotal),
      grandTotal: money(order.grandTotal),
      shipFullName: order.shipFullName,
      shipLine1: order.shipLine1,
      shipLine2: order.shipLine2,
      shipCity: order.shipCity,
      shipState: order.shipState,
      shipCountry: order.shipCountry,
      shipPostalCode: order.shipPostalCode,
      items: order.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        unitPrice: money(item.unitPrice),
        quantity: item.quantity,
        lineTotal: money(item.lineTotal),
      })),
      createdAt: order.createdAt,
    };
  }

  async getOrder(userId: string, orderId: string): Promise<OrderView> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException('Order not found');
    return this.toOrderView(order);
  }

  async listOrders(
    userId: string,
    query: ListOrdersDto,
  ): Promise<Paginated<OrderSummary>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where = { userId };

    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          status: true,
          grandTotal: true,
          createdAt: true,
          _count: { select: { items: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        status: row.status,
        grandTotal: money(row.grandTotal),
        itemCount: row._count.items,
        createdAt: row.createdAt,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * Drive an order through the status state machine.
   *
   * - **ADMIN** may apply any transition the state machine permits.
   * - **CUSTOMER** may only cancel their own still-`PENDING` order
   *   (`PENDING → CANCELLED`); any other transition is forbidden.
   *
   * The transition itself is validated by the pure `assertTransition` guard, so
   * an illegal move (e.g. `PENDING → SHIPPED`) is rejected as a 409 Conflict.
   * A non-owned order is reported as 404 to a customer (no existence leak).
   */
  async updateStatus(
    actor: AccessTokenPayload,
    orderId: string,
    nextStatus: OrderStatus,
  ): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException('Order not found');

    if (actor.role !== Role.ADMIN) {
      // Customers can only act on their own orders; hide others as 404.
      if (order.userId !== actor.sub) {
        throw new NotFoundException('Order not found');
      }
      // The only self-service transition is cancelling a pending order.
      const isSelfCancel =
        order.status === OrderStatus.PENDING &&
        nextStatus === OrderStatus.CANCELLED;
      if (!isSelfCancel) {
        throw new ForbiddenException(
          'You can only cancel an order while it is pending',
        );
      }
    }

    try {
      assertTransition(
        order.status as unknown as OrderStatusFlow,
        nextStatus as unknown as OrderStatusFlow,
      );
    } catch (err) {
      if (err instanceof InvalidOrderTransitionError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }

    // Cancelling frees the stock reserved at placement. Release each line and
    // update the status atomically so the ledger can't drift from the order.
    if (nextStatus === OrderStatus.CANCELLED) {
      const updated = await this.prisma.$transaction(async (tx) => {
        for (const item of order.items) {
          await this.inventory.release(
            item.productId,
            item.quantity,
            order.id,
            tx,
          );
        }
        return tx.order.update({
          where: { id: orderId },
          data: { status: nextStatus },
          include: ORDER_INCLUDE,
        });
      });
      return this.toOrderView(updated);
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: nextStatus },
      include: ORDER_INCLUDE,
    });
    return this.toOrderView(updated);
  }
}
