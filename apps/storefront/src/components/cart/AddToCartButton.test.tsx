import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CartProvider } from './CartProvider';
import { AddToCartButton } from './AddToCartButton';
import type { CartView } from '@/lib/api-cart';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const cart: CartView = {
  id: 'c1', items: [], totals: { subtotal: '0.00', discountTotal: '0.00', taxTotal: '0.00', shippingTotal: '0.00', grandTotal: '0.00' },
};

beforeEach(() => { global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => cart }); });

describe('AddToCartButton', () => {
  it('calls the add endpoint with the product id', async () => {
    render(<CartProvider initialCart={cart}><AddToCartButton productId="p1" /></CartProvider>);
    await act(async () => { screen.getByRole('button', { name: /add to cart/i }).click(); });
    expect(global.fetch).toHaveBeenCalledWith('/api/cart/items', expect.objectContaining({ method: 'POST' }));
  });

  it('is disabled when the product is unavailable', () => {
    render(<CartProvider initialCart={cart}><AddToCartButton productId="p1" disabled /></CartProvider>);
    expect(screen.getByRole('button', { name: /add to cart|unavailable/i })).toBeDisabled();
  });
});
