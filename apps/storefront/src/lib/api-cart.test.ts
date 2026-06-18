import { describe, it, expect, vi } from 'vitest';
import { getCart, addItem, type CartApiDeps, type CartView } from './api-cart';

const envelope: CartView = {
  id: 'cart1',
  items: [
    { productId: 'p1', name: 'Mouse', unitPrice: '19.99', quantity: 2, lineTotal: '39.98', image: null },
  ],
  totals: { subtotal: '39.98', discountTotal: '0.00', taxTotal: '4.00', shippingTotal: '5.00', grandTotal: '48.98' },
};

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

const baseDeps = (over: Partial<CartApiDeps> = {}): CartApiDeps => ({
  baseUrl: 'http://api.test',
  getAccessToken: () => 'access-1',
  getRefreshToken: () => 'refresh-1',
  onTokensRefreshed: vi.fn(),
  onSessionInvalid: vi.fn(),
  fetch: vi.fn(),
  ...over,
});

describe('cart API client', () => {
  it('getCart issues GET /cart and returns the envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(envelope));
    const res = await getCart(baseDeps({ fetch: fetchMock }));
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/cart', expect.objectContaining({ method: 'GET' }));
    expect(res).toEqual(envelope);
  });

  it('addItem POSTs /cart/items with productId + quantity', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(envelope));
    await addItem('p1', 2, baseDeps({ fetch: fetchMock }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/cart/items');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ productId: 'p1', quantity: 2 });
  });
});
