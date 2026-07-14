import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  OrderStatus,
  Prisma,
  ProductStatus,
  Role,
  SubOrderStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth/auth-tokens';
import { InventoryService } from '../inventory/inventory.service';
import type { LowStockEvent } from '../inventory/inventory.events';
import { resolveTotalsConfig } from '../cart/cart.config';
import { priceItems } from '../cart/cart-pricing';
import { TotalsConfig } from '../cart/totals';
import {
  assertTransition,
  InvalidOrderTransitionError,
  OrderStatus as OrderStatusFlow,
} from './order-status';
import { sumTotals } from './sum-totals';
import { groupCartLinesBySeller, type SellerLine } from './group-by-seller';
import { AuditService } from '../audit/audit.service';
import { ORDER_STATUS_CHANGED, REFUND_ISSUED } from '../audit/audit-actions';
import { ORDER_PLACED, ORDER_STATUS_CHANGED_EVENT } from './orders-events';
import { CheckoutDto } from './dto/checkout.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { ListAdminOrdersDto } from './dto/list-admin-orders.dto';

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

/** Admin order-list row: an order summary plus its customer. */
export interface AdminOrderSummary extends OrderSummary {
  customerEmail: string;
  customerName: string;
}

/** Admin order detail: the full order view plus its customer. */
export interface AdminOrderView extends OrderView {
  customerEmail: string;
  customerName: string;
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
          seller: { select: { id: true, displayName: true } },
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
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
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

    // Validate each line and pair it with its seller (for grouping) + pricer input.
    const sellerLines: SellerLine[] = cart.items.map((item) => {
      const p = item.product;
      if (p.deletedAt !== null || p.status !== ProductStatus.ACTIVE) {
        throw new BadRequestException(
          `'${p.name}' is no longer available; remove it to checkout`,
        );
      }
      return {
        sellerId: p.seller.id,
        sellerName: p.seller.displayName,
        item: {
          productId: item.productId,
          quantity: item.quantity,
          product: {
            name: p.name,
            price: p.price.toString(),
            salePrice: p.salePrice !== null ? p.salePrice.toString() : null,
          },
        },
      };
    });

    // Group by seller; price each group; the Order total is the sum of groups.
    const groups = groupCartLinesBySeller(sellerLines).map((g) => ({
      ...g,
      priced: priceItems(g.items, this.totalsConfig),
    }));
    const orderTotals = sumTotals(groups.map((g) => g.priced.totals));
    const allLines = groups.flatMap((g) => g.priced.lines);

    const ship = {
      shipFullName: dto.shipFullName,
      shipLine1: dto.shipLine1,
      shipLine2: dto.shipLine2 ?? null,
      shipCity: dto.shipCity,
      shipState: dto.shipState,
      shipCountry: dto.shipCountry,
      shipPostalCode: dto.shipPostalCode,
    };

    const { order, lowStockCrossings } = await this.prisma.$transaction(
      async (tx) => {
        // Order: aggregate totals + ALL OrderItems (dual-write, shape unchanged).
        const created = await tx.order.create({
          data: {
            userId,
            status: OrderStatus.PENDING,
            subtotal: orderTotals.subtotal,
            discountTotal: orderTotals.discountTotal,
            taxTotal: orderTotals.taxTotal,
            shippingTotal: orderTotals.shippingTotal,
            grandTotal: orderTotals.grandTotal,
            ...ship,
            items: {
              create: allLines.map((line) => ({
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

        const crossings: LowStockEvent[] = [];
        for (const group of groups) {
          const subOrder = await tx.subOrder.create({
            data: {
              orderId: created.id,
              sellerId: group.sellerId,
              status: SubOrderStatus.PENDING,
              subtotal: group.priced.totals.subtotal,
              discountTotal: group.priced.totals.discountTotal,
              taxTotal: group.priced.totals.taxTotal,
              shippingTotal: group.priced.totals.shippingTotal,
              grandTotal: group.priced.totals.grandTotal,
              ...ship,
              items: {
                create: group.priced.lines.map((line) => ({
                  productId: line.productId,
                  productName: line.name,
                  unitPrice: line.unitPrice,
                  quantity: line.quantity,
                  lineTotal: line.lineTotal,
                  sellerName: group.sellerName,
                })),
              },
            },
          });
          // Reserve per line, referencing BOTH the order and this sub-order.
          for (const line of group.priced.lines) {
            const crossing = await this.inventory.reserve(
              line.productId,
              line.quantity,
              created.id,
              tx,
              subOrder.id,
            );
            if (crossing) crossings.push(crossing);
          }
        }

        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        return { order: created, lowStockCrossings: crossings };
      },
    );

    for (const crossing of lowStockCrossings) {
      this.inventory.emitLowStock(crossing);
    }
    this.events.emit(ORDER_PLACED, { orderId: order.id, userId: order.userId });

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
   * Admin: list every customer's orders (newest-first, paginated), each with
   * its customer's email/name. Optional status filter. Not user-scoped.
   */
  async listAllOrders(
    query: ListAdminOrdersDto,
  ): Promise<Paginated<AdminOrderSummary>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where: Prisma.OrderWhereInput =
      query.status !== undefined ? { status: query.status } : {};

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
          user: { select: { email: true, name: true } },
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
        customerEmail: row.user.email,
        customerName: row.user.name,
        createdAt: row.createdAt,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * Admin: fetch any order by id (not ownership-scoped), with its items and
   * customer. 404 if it doesn't exist.
   */
  async getAnyOrder(orderId: string): Promise<AdminOrderView> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        ...ORDER_INCLUDE,
        user: { select: { email: true, name: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return {
      ...this.toOrderView(order),
      customerEmail: order.user.email,
      customerName: order.user.name,
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

    // Some transitions move stock through the ledger, atomically with the
    // status change so the two can never drift:
    //   - CANCELLED releases the reserve back to available
    //   - SHIPPED deducts the reserve (goods have left the warehouse)
    //   - REFUNDED restocks the goods back to available
    // These statuses are mutually exclusive per the state machine, so at most
    // one stock op runs for a given transition.
    if (this.movesStock(nextStatus)) {
      const updated = await this.prisma.$transaction(async (tx) => {
        for (const item of order.items) {
          await this.applyStockForStatus(
            nextStatus,
            item.productId,
            item.quantity,
            order.id,
            tx,
          );
        }
        const u = await tx.order.update({
          where: { id: orderId },
          data: { status: nextStatus },
          include: ORDER_INCLUDE,
        });
        await this.audit.record(
          {
            actorId: actor.sub,
            action: ORDER_STATUS_CHANGED,
            entityType: 'Order',
            entityId: orderId,
            metadata: { from: order.status, to: nextStatus },
          },
          tx,
        );
        if (nextStatus === OrderStatus.REFUNDED) {
          await this.audit.record(
            {
              actorId: actor.sub,
              action: REFUND_ISSUED,
              entityType: 'Order',
              entityId: orderId,
              metadata: { grandTotal: order.grandTotal.toString() },
            },
            tx,
          );
        }
        return u;
      });
      this.events.emit(ORDER_STATUS_CHANGED_EVENT, {
        orderId: updated.id,
        userId: updated.userId,
        status: nextStatus,
      });
      return this.toOrderView(updated);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.order.update({
        where: { id: orderId },
        data: { status: nextStatus },
        include: ORDER_INCLUDE,
      });
      await this.audit.record(
        {
          actorId: actor.sub,
          action: ORDER_STATUS_CHANGED,
          entityType: 'Order',
          entityId: orderId,
          metadata: { from: order.status, to: nextStatus },
        },
        tx,
      );
      return u;
    });
    this.events.emit(ORDER_STATUS_CHANGED_EVENT, {
      orderId: updated.id,
      userId: updated.userId,
      status: nextStatus,
    });
    return this.toOrderView(updated);
  }

  /** Whether a transition into `status` moves stock through the ledger. */
  private movesStock(status: OrderStatus): boolean {
    return (
      status === OrderStatus.CANCELLED ||
      status === OrderStatus.SHIPPED ||
      status === OrderStatus.REFUNDED
    );
  }

  /**
   * Verified-purchase gate for reviews (M4a): true iff `userId` has a DELIVERED
   * order containing `productId`. Exposed as the reviews module's injected
   * orders-read so `reviews` never touches Order tables directly (ADR-002).
   * Tighten to SubOrder when M5 lands.
   */
  async hasDeliveredProduct(
    userId: string,
    productId: string,
  ): Promise<boolean> {
    const order = await this.prisma.order.findFirst({
      where: {
        userId,
        status: OrderStatus.DELIVERED,
        items: { some: { productId } },
      },
      select: { id: true },
    });
    return order !== null;
  }

  /** Apply the per-line inventory effect of a stock-moving status transition. */
  private async applyStockForStatus(
    status: OrderStatus,
    productId: string,
    quantity: number,
    orderId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    switch (status) {
      case OrderStatus.CANCELLED:
        await this.inventory.release(productId, quantity, orderId, tx);
        return;
      case OrderStatus.SHIPPED:
        await this.inventory.deduct(productId, quantity, orderId, tx);
        return;
      case OrderStatus.REFUNDED:
        await this.inventory.restock(productId, quantity, orderId, tx);
        return;
      default:
        return;
    }
  }
}
