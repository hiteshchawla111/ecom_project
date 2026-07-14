import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubOrderCard } from './SubOrderCard';
import type { SubOrderView } from '../../lib/sellerSubOrders';

const sub = (over: Partial<SubOrderView> = {}): SubOrderView => ({
  id: 'sub-123456789',
  orderId: 'order-abcdefgh',
  status: 'PENDING',
  subtotal: '100.00', discountTotal: '0.00', taxTotal: '8.00', shippingTotal: '5.00', grandTotal: '113.00',
  shipFullName: 'Ada Lovelace', shipLine1: '1 Analytical Way', shipLine2: null,
  shipCity: 'London', shipState: 'LDN', shipCountry: 'UK', shipPostalCode: 'EC1',
  items: [{ productId: 'p1', productName: 'Widget', unitPrice: '50.00', quantity: 2, lineTotal: '100.00', sellerName: 'Shop One' }],
  createdAt: '2026-07-01T12:00:00.000Z',
  ...over,
});

describe('SubOrderCard', () => {
  it('renders status, order ref, total, ship-to and items', () => {
    render(<SubOrderCard subOrder={sub()} busy={false} error={null} onTransition={vi.fn()} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText(/cdefgh/i)).toBeInTheDocument(); // order-ref tail (last 8 of orderId)
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText(/Widget/)).toBeInTheDocument();
  });

  it('shows only valid next-status action buttons (PENDING → Confirm, Cancel)', () => {
    render(<SubOrderCard subOrder={sub({ status: 'PENDING' })} busy={false} error={null} onTransition={vi.fn()} />);
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ship/i })).toBeNull();
  });

  it('renders no action buttons for a terminal status', () => {
    const delivered = render(<SubOrderCard subOrder={sub({ status: 'DELIVERED' })} busy={false} error={null} onTransition={vi.fn()} />);
    // DELIVERED → REFUNDED is the only move; assert CONFIRM/CANCEL/SHIP are absent, REFUND present
    expect(screen.queryByRole('button', { name: /confirm/i })).toBeNull();
    expect(screen.getByRole('button', { name: /refund/i })).toBeInTheDocument();
    delivered.unmount(); // RTL's per-`it` afterEach cleanup doesn't run mid-test; unmount explicitly before the next render in this same test.
    render(<SubOrderCard subOrder={sub({ status: 'CANCELLED' })} busy={false} error={null} onTransition={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('calls onTransition(id, next) when an action is clicked', async () => {
    const onTransition = vi.fn();
    render(<SubOrderCard subOrder={sub({ status: 'PENDING' })} busy={false} error={null} onTransition={onTransition} />);
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onTransition).toHaveBeenCalledWith('sub-123456789', 'CONFIRMED');
  });

  it('disables actions when busy and shows an inline error', () => {
    render(<SubOrderCard subOrder={sub({ status: 'PENDING' })} busy={true} error="Nope" onTransition={vi.fn()} />);
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled();
    expect(screen.getByText('Nope')).toBeInTheDocument();
  });
});
