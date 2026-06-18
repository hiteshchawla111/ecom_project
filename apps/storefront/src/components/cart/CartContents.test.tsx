import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CartProvider } from './CartProvider';
import { CartContents } from './CartContents';
import type { CartView } from '@/lib/api-cart';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const full: CartView = {
  id: 'c1',
  items: [{ productId: 'p1', name: 'Mouse', unitPrice: '19.99', quantity: 2, lineTotal: '39.98', image: null }],
  totals: { subtotal: '39.98', discountTotal: '0.00', taxTotal: '4.00', shippingTotal: '5.00', grandTotal: '48.98' },
};
const empty: CartView = { id: 'c1', items: [], totals: full.totals };

const renderWith = (initial: CartView) =>
  render(<CartProvider initialCart={initial}><CartContents initial={initial} /></CartProvider>);

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('CartContents', () => {
  it('renders line items and the grand total from the envelope', () => {
    renderWith(full);
    expect(screen.getByText('Mouse')).toBeInTheDocument();
    expect(screen.getByText('$48.98')).toBeInTheDocument(); // grand total
  });

  it('shows the empty state with a link to products when there are no items', () => {
    renderWith(empty);
    expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse products|continue shopping/i })).toHaveAttribute('href', '/products');
  });

  it('renders a checkout link to /checkout when items exist', () => {
    renderWith(full);
    expect(screen.getByRole('link', { name: /checkout/i })).toHaveAttribute('href', '/checkout');
  });

  describe('qty stepper — increment', () => {
    it('PATCHes /api/cart/items/:productId with quantity = current + 1 when "+" is clicked', async () => {
      const updated: CartView = {
        ...full,
        items: [{ ...full.items[0], quantity: 3, lineTotal: '59.97' }],
      };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true, status: 200, json: async () => updated,
      });

      renderWith(full);

      await act(async () => {
        screen.getByRole('button', { name: /increase quantity of Mouse/i }).click();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/cart/items/p1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ quantity: 3 }),
        }),
      );
    });
  });

  describe('qty stepper — decrement', () => {
    it('PATCHes /api/cart/items/:productId with quantity = current - 1 when "−" is clicked', async () => {
      const updated: CartView = {
        ...full,
        items: [{ ...full.items[0], quantity: 1, lineTotal: '19.99' }],
      };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true, status: 200, json: async () => updated,
      });

      renderWith(full);

      await act(async () => {
        screen.getByRole('button', { name: /decrease quantity of Mouse/i }).click();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/cart/items/p1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ quantity: 1 }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('DELETEs /api/cart/items/:productId when "Remove" is clicked', async () => {
      const emptied: CartView = { ...full, items: [] };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true, status: 200, json: async () => emptied,
      });

      renderWith(full);

      await act(async () => {
        screen.getByRole('button', { name: /remove Mouse/i }).click();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/cart/items/p1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('clear cart', () => {
    it('DELETEs /api/cart when confirm returns true', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const emptied: CartView = { ...full, items: [] };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true, status: 200, json: async () => emptied,
      });

      renderWith(full);

      await act(async () => {
        screen.getByRole('button', { name: /clear cart/i }).click();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/cart',
        expect.objectContaining({ method: 'DELETE' }),
      );

      vi.restoreAllMocks();
    });

    it('does NOT call fetch when confirm returns false', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      renderWith(full);

      await act(async () => {
        screen.getByRole('button', { name: /clear cart/i }).click();
      });

      expect(global.fetch).not.toHaveBeenCalled();

      vi.restoreAllMocks();
    });
  });
});
