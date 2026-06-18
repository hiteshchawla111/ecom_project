import { describe, it, expect, vi } from 'vitest';
import { handlePlaceOrder, type OrdersRouteDeps } from './handlers';
import { ApiAuthError } from '@/lib/api-auth';
import type { OrderView } from '@/lib/api-orders';

const order = { id: 'o1', status: 'PENDING' } as OrderView;

const shipping = {
  shipFullName: 'Ada', shipLine1: '12 Way', shipCity: 'London',
  shipState: 'GL', shipCountry: 'UK', shipPostalCode: 'EC1A',
};

const deps = (over: Partial<OrdersRouteDeps> = {}): OrdersRouteDeps => ({
  placeOrder: vi.fn().mockResolvedValue(order),
  ...over,
});

describe('handlePlaceOrder', () => {
  it('returns 201 + the order on success', async () => {
    const d = deps();
    const res = await handlePlaceOrder(shipping, d);
    expect(d.placeOrder).toHaveBeenCalledWith(shipping);
    expect(res).toEqual({ status: 201, body: order });
  });

  it('returns 400 when a required shipping field is missing', async () => {
    const res = await handlePlaceOrder({ ...shipping, shipFullName: '' }, deps());
    expect(res.status).toBe(400);
  });

  it('maps an ApiAuthError to its status + message', async () => {
    const d = deps({ placeOrder: vi.fn().mockRejectedValue(new ApiAuthError('Your cart is empty', 400)) });
    const res = await handlePlaceOrder(shipping, d);
    expect(res).toEqual({ status: 400, body: { message: 'Your cart is empty' } });
  });
});
