import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CartProvider, useCart } from './CartProvider';
import type { CartView } from '@/lib/api-cart';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const cart = (qty: number): CartView => ({
  id: 'c1',
  items: qty ? [{ productId: 'p1', name: 'M', unitPrice: '5.00', quantity: qty, lineTotal: (5 * qty).toFixed(2), image: null }] : [],
  totals: { subtotal: '0.00', discountTotal: '0.00', taxTotal: '0.00', shippingTotal: '0.00', grandTotal: '0.00' },
});

function Probe() {
  const { itemCount, add } = useCart();
  return (
    <div>
      <span data-testid="count">{itemCount}</span>
      <button onClick={() => void add('p1', 2)}>add</button>
    </div>
  );
}

beforeEach(() => {
  pushMock.mockReset();
  global.fetch = vi.fn();
});

describe('CartProvider', () => {
  it('derives itemCount from the initial cart', () => {
    render(
      <CartProvider initialCart={cart(3)}>
        <Probe />
      </CartProvider>,
    );
    expect(screen.getByTestId('count').textContent).toBe('3');
  });

  it('replaces state with the API envelope after an action', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => cart(5),
    });
    render(
      <CartProvider initialCart={cart(0)}>
        <Probe />
      </CartProvider>,
    );
    await act(async () => {
      screen.getByText('add').click();
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/cart/items', expect.objectContaining({ method: 'POST' }));
    expect(screen.getByTestId('count').textContent).toBe('5');
  });

  it('redirects to /login when an action returns 401', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Session expired' }),
    });
    render(
      <CartProvider initialCart={cart(0)}>
        <Probe />
      </CartProvider>,
    );
    await act(async () => {
      screen.getByText('add').click();
    });
    expect(pushMock).toHaveBeenCalledWith('/login');
  });
});
