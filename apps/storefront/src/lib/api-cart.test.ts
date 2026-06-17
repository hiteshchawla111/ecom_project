import { describe, it, expect, vi } from 'vitest';
import {
  getCart,
  addItem,
  type CartApiDeps,
  type CartView,
} from './api-cart';
import { ApiAuthError } from './api-auth';

const envelope: CartView = {
  id: 'cart1',
  items: [
    { productId: 'p1', name: 'Mouse', unitPrice: '19.99', quantity: 2, lineTotal: '39.98', image: null },
  ],
  totals: { subtotal: '39.98', discountTotal: '0.00', taxTotal: '4.00', shippingTotal: '5.00', grandTotal: '48.98' },
};

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;
const errResponse = (status: number, body: unknown) =>
  ({ ok: false, status, json: async () => body }) as Response;

const baseDeps = (over: Partial<CartApiDeps> = {}): CartApiDeps => ({
  baseUrl: 'http://api.test',
  getAccessToken: () => 'access-1',
  getRefreshToken: () => 'refresh-1',
  onTokensRefreshed: vi.fn(),
  onSessionInvalid: vi.fn(),
  fetch: vi.fn(),
  ...over,
});

describe('cartRequest', () => {
  it('calls the API with the bearer token and returns the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(envelope));
    const deps = baseDeps({ fetch: fetchMock });

    const res = await getCart(deps);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/cart',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ authorization: 'Bearer access-1' }),
      }),
    );
    expect(res).toEqual(envelope);
  });

  it('POSTs add-item with productId + quantity', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(envelope));
    const deps = baseDeps({ fetch: fetchMock });

    await addItem('p1', 2, deps);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/cart/items');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ productId: 'p1', quantity: 2 });
  });

  it('refreshes once on 401 then retries with the new token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(okResponse(envelope));
    // refresh() is called via deps; stub the refresh path through onTokensRefreshed
    const onTokensRefreshed = vi.fn();
    const deps = baseDeps({
      fetch: fetchMock,
      onTokensRefreshed,
      // inject a refresh function via the live wiring? No — cartRequest calls api-auth.refresh.
      // To keep this unit pure, refresh is injected; see implementation note.
      refresh: vi.fn().mockResolvedValue({ accessToken: 'access-2', refreshToken: 'refresh-2' }),
    } as Partial<CartApiDeps>);

    const res = await getCart(deps);

    // second fetch used the refreshed token
    const secondInit = fetchMock.mock.calls[1][1];
    expect(secondInit.headers.authorization).toBe('Bearer access-2');
    expect(onTokensRefreshed).toHaveBeenCalledWith({ accessToken: 'access-2', refreshToken: 'refresh-2' });
    expect(res).toEqual(envelope);
  });

  it('invalidates the session when refresh fails on 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(401, { message: 'expired' }));
    const onSessionInvalid = vi.fn();
    const deps = baseDeps({
      fetch: fetchMock,
      onSessionInvalid,
      refresh: vi.fn().mockRejectedValue(new ApiAuthError('bad', 401)),
    } as Partial<CartApiDeps>);

    await expect(getCart(deps)).rejects.toBeInstanceOf(ApiAuthError);
    expect(onSessionInvalid).toHaveBeenCalled();
  });

  it('surfaces a non-401 retry error honestly without invalidating the session', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(errResponse(500, { message: 'boom' }));
    const onSessionInvalid = vi.fn();
    const deps = baseDeps({
      fetch: fetchMock,
      onSessionInvalid,
      refresh: vi.fn().mockResolvedValue({ accessToken: 'access-2', refreshToken: 'refresh-2' }),
    } as Partial<CartApiDeps>);

    await expect(getCart(deps)).rejects.toMatchObject({ status: 500 });
    expect(onSessionInvalid).not.toHaveBeenCalled();
  });

  it('flattens an array message from the API error body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(400, { message: ['a', 'b'] }));
    const deps = baseDeps({ fetch: fetchMock, getAccessToken: () => 'access-1', getRefreshToken: () => undefined });

    await expect(getCart(deps)).rejects.toMatchObject({ status: 400, message: 'a, b' });
  });
});
