import { describe, it, expect, vi } from 'vitest';
import { placeOrder, getOrder, type CheckoutInput, type OrderView, type AuthedApiDeps } from './api-orders';

const order: OrderView = {
  id: 'order1',
  status: 'PENDING',
  subtotal: '39.98', discountTotal: '0.00', taxTotal: '4.00', shippingTotal: '5.00', grandTotal: '48.98',
  shipFullName: 'Ada Lovelace', shipLine1: '12 Analytical Way', shipLine2: null,
  shipCity: 'London', shipState: 'Greater London', shipCountry: 'UK', shipPostalCode: 'EC1A 1BB',
  items: [{ productId: 'p1', productName: 'Mouse', unitPrice: '19.99', quantity: 2, lineTotal: '39.98' }],
  createdAt: '2026-06-17T12:00:00.000Z',
};

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

const baseDeps = (over: Partial<AuthedApiDeps> = {}): AuthedApiDeps => ({
  baseUrl: 'http://api.test',
  getAccessToken: () => 'access-1',
  getRefreshToken: () => 'refresh-1',
  onTokensRefreshed: vi.fn(),
  onSessionInvalid: vi.fn(),
  fetch: vi.fn(),
  ...over,
});

const shipping: CheckoutInput = {
  shipFullName: 'Ada Lovelace', shipLine1: '12 Analytical Way',
  shipCity: 'London', shipState: 'Greater London', shipCountry: 'UK', shipPostalCode: 'EC1A 1BB',
};

describe('orders API client', () => {
  it('placeOrder POSTs /orders with the shipping body and returns the order', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(order));
    const res = await placeOrder(shipping, baseDeps({ fetch: fetchMock }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/orders');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(shipping);
    expect(res).toEqual(order);
  });

  it('getOrder GETs /orders/:id (id encoded) and returns the order', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(order));
    const res = await getOrder('order 1', baseDeps({ fetch: fetchMock }));
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/orders/order%201',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(res).toEqual(order);
  });
});
