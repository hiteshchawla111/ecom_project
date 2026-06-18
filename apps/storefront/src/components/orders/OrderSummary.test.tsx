import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderSummary } from './OrderSummary';
import type { OrderView } from '@/lib/api-orders';

const order: OrderView = {
  id: 'order1',
  status: 'PENDING',
  subtotal: '39.98', discountTotal: '0.00', taxTotal: '4.00', shippingTotal: '5.00', grandTotal: '48.98',
  shipFullName: 'Ada Lovelace', shipLine1: '12 Analytical Way', shipLine2: null,
  shipCity: 'London', shipState: 'Greater London', shipCountry: 'UK', shipPostalCode: 'EC1A 1BB',
  items: [{ productId: 'p1', productName: 'Mouse', unitPrice: '19.99', quantity: 2, lineTotal: '39.98' }],
  createdAt: '2026-06-17T12:00:00.000Z',
};

describe('OrderSummary', () => {
  it('renders status, items, totals, and the shipping snapshot', () => {
    render(<OrderSummary order={order} />);
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
    expect(screen.getByText('Mouse')).toBeInTheDocument();
    expect(screen.getByText('$48.98')).toBeInTheDocument();       // grand total
    expect(screen.getByText(/ada lovelace/i)).toBeInTheDocument();
    expect(screen.getByText(/12 analytical way/i)).toBeInTheDocument();
  });
});
