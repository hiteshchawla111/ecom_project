import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CartProvider } from './CartProvider';
import { CartCountBadge } from './CartCountBadge';
import type { CartView } from '@/lib/api-cart';

const cart = (qty: number): CartView => ({
  id: 'c1',
  items: qty ? [{ productId: 'p1', name: 'M', unitPrice: '5.00', quantity: qty, lineTotal: '5.00', image: null }] : [],
  totals: { subtotal: '0.00', discountTotal: '0.00', taxTotal: '0.00', shippingTotal: '0.00', grandTotal: '0.00' },
});

describe('CartCountBadge', () => {
  it('shows the count when items exist', () => {
    render(<CartProvider initialCart={cart(2)}><CartCountBadge /></CartProvider>);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders nothing when the cart is empty', () => {
    const { container } = render(<CartProvider initialCart={cart(0)}><CartCountBadge /></CartProvider>);
    expect(container.querySelector('[data-testid="cart-count"]')).toBeNull();
  });
});
