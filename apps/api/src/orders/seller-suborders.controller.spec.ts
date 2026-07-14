/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Role, SubOrderStatus } from '@prisma/client';
import { SellerSubOrdersController } from './seller-suborders.controller';

const makeService = () => ({
  listSellerSubOrders: jest.fn().mockResolvedValue({ data: [], nextCursor: null }),
  transitionSubOrder: jest.fn().mockResolvedValue({ id: 'sub1' }),
});

describe('SellerSubOrdersController', () => {
  const seller = { sub: 'u1', email: 's@b.c', role: Role.SELLER };
  const admin = { sub: 'a1', email: 'a@b.c', role: Role.ADMIN };

  it('list delegates with a SELLER scope actor (from req.sellerId) + query', async () => {
    const svc = makeService();
    const ctrl = new SellerSubOrdersController(svc as never);
    await ctrl.list(seller as never, { sellerId: 'seller-1' }, { limit: 10 });
    expect(svc.listSellerSubOrders).toHaveBeenCalledWith(
      { role: Role.SELLER, sellerId: 'seller-1' }, { limit: 10 },
    );
  });

  it('list for an ADMIN (no req.sellerId) delegates an unscoped ADMIN actor', async () => {
    const svc = makeService();
    const ctrl = new SellerSubOrdersController(svc as never);
    await ctrl.list(admin as never, {}, {});
    expect(svc.listSellerSubOrders).toHaveBeenCalledWith({ role: Role.ADMIN }, {});
  });

  it('updateStatus delegates with {sub, role, sellerId} for a seller', async () => {
    const svc = makeService();
    const ctrl = new SellerSubOrdersController(svc as never);
    await ctrl.updateStatus(seller as never, { sellerId: 'seller-1' }, 'sub1', {
      status: SubOrderStatus.CONFIRMED,
    });
    expect(svc.transitionSubOrder).toHaveBeenCalledWith(
      { sub: 'u1', role: Role.SELLER, sellerId: 'seller-1' }, 'sub1', SubOrderStatus.CONFIRMED,
    );
  });

  it('updateStatus for an ADMIN passes role ADMIN + undefined sellerId', async () => {
    const svc = makeService();
    const ctrl = new SellerSubOrdersController(svc as never);
    await ctrl.updateStatus(admin as never, {}, 'sub1', { status: SubOrderStatus.SHIPPED });
    expect(svc.transitionSubOrder).toHaveBeenCalledWith(
      { sub: 'a1', role: Role.ADMIN, sellerId: undefined }, 'sub1', SubOrderStatus.SHIPPED,
    );
  });
});
