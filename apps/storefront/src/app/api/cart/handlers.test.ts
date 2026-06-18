import { describe, it, expect, vi } from 'vitest';
import {
  handleGetCart,
  handleAddItem,
  handleSetQuantity,
  type CartRouteDeps,
} from './handlers';
import { ApiAuthError } from '@/lib/api-auth';
import type { CartView } from '@/lib/api-cart';

const envelope: CartView = {
  id: 'c1',
  items: [],
  totals: { subtotal: '0.00', discountTotal: '0.00', taxTotal: '0.00', shippingTotal: '0.00', grandTotal: '0.00' },
};

const deps = (over: Partial<CartRouteDeps> = {}): CartRouteDeps => ({
  getCart: vi.fn().mockResolvedValue(envelope),
  addItem: vi.fn().mockResolvedValue(envelope),
  setItemQuantity: vi.fn().mockResolvedValue(envelope),
  removeItem: vi.fn().mockResolvedValue(envelope),
  clearCart: vi.fn().mockResolvedValue(envelope),
  ...over,
});

describe('cart handlers', () => {
  it('handleGetCart returns 200 + envelope', async () => {
    const res = await handleGetCart(deps());
    expect(res).toEqual({ status: 200, body: envelope });
  });

  it('handleAddItem validates productId + integer quantity', async () => {
    const res = await handleAddItem({ productId: '', quantity: 1 }, deps());
    expect(res.status).toBe(400);
  });

  it('handleAddItem passes through and returns the envelope', async () => {
    const d = deps();
    const res = await handleAddItem({ productId: 'p1', quantity: 2 }, d);
    expect(d.addItem).toHaveBeenCalledWith('p1', 2);
    expect(res).toEqual({ status: 200, body: envelope });
  });

  it('maps an ApiAuthError to its status + message', async () => {
    const d = deps({ getCart: vi.fn().mockRejectedValue(new ApiAuthError('Product is not available for purchase', 400)) });
    const res = await handleGetCart(d);
    expect(res).toEqual({ status: 400, body: { message: 'Product is not available for purchase' } });
  });

  it('handleSetQuantity rejects a negative quantity with 400', async () => {
    const res = await handleSetQuantity('p1', { quantity: -1 }, deps());
    expect(res.status).toBe(400);
  });
});
