import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
