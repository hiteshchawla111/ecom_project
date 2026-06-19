import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { AdminOrderDetail, OrderStatus } from '../lib/orders';
import { ApiError } from '../lib/types';

const getOrder = vi.fn();
const updateOrderStatus = vi.fn();
vi.mock('../lib/orders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/orders')>();
  return {
    ...actual,
    getOrder: (...a: unknown[]) => getOrder(...a),
    updateOrderStatus: (...a: unknown[]) => updateOrderStatus(...a),
  };
});

import { OrderDetailPage } from './OrderDetailPage';

const detail = (over: Partial<AdminOrderDetail> = {}): AdminOrderDetail => ({
  id: 'o1',
  status: 'PENDING' as OrderStatus,
  subtotal: '39.98',
  discountTotal: '0.00',
  taxTotal: '4.00',
  shippingTotal: '5.00',
  grandTotal: '48.98',
  shipFullName: 'Ada Lovelace',
  shipLine1: '12 Analytical Way',
  shipLine2: null,
  shipCity: 'London',
  shipState: 'Greater London',
  shipCountry: 'UK',
  shipPostalCode: 'EC1A 1BB',
  customerEmail: 'ada@shop.test',
  customerName: 'Ada Lovelace',
  createdAt: '2026-06-18T12:00:00.000Z',
  items: [
    {
      productId: 'p1',
      productName: 'Mouse',
      unitPrice: '19.99',
      quantity: 2,
      lineTotal: '39.98',
    },
  ],
  ...over,
});

const renderAt = (id = 'o1') =>
  render(
    <MemoryRouter initialEntries={[`/orders/${id}`]}>
      <Routes>
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/orders" element={<div>orders list</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  getOrder.mockReset();
  updateOrderStatus.mockReset();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('OrderDetailPage', () => {
  it('renders items, totals, shipping, and customer', async () => {
    getOrder.mockResolvedValue(detail());
    renderAt();

    expect(await screen.findByText('Mouse')).toBeInTheDocument();
    expect(screen.getByText('ada@shop.test')).toBeInTheDocument();
    expect(screen.getByText(/48\.98/)).toBeInTheDocument(); // grand total
    expect(screen.getByText(/12 Analytical Way/)).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('offers a button for each valid next status', async () => {
    getOrder.mockResolvedValue(detail({ status: 'PENDING' }));
    renderAt();
    await screen.findByText('Mouse');

    // PENDING -> CONFIRMED | CANCELLED
    expect(
      screen.getByRole('button', { name: /confirm/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    // not a later transition
    expect(
      screen.queryByRole('button', { name: /ship/i }),
    ).not.toBeInTheDocument();
  });

  it('drives a transition and refetches the order', async () => {
    getOrder.mockResolvedValueOnce(detail({ status: 'PENDING' }));
    updateOrderStatus.mockResolvedValue(detail({ status: 'CONFIRMED' }));
    getOrder.mockResolvedValueOnce(detail({ status: 'CONFIRMED' }));
    renderAt();
    await screen.findByText('Mouse');

    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() =>
      expect(updateOrderStatus).toHaveBeenCalledWith('o1', 'CONFIRMED'),
    );
    expect(await screen.findByText('Confirmed')).toBeInTheDocument();
  });

  it('offers Refund on a delivered order', async () => {
    getOrder.mockResolvedValue(detail({ status: 'DELIVERED' }));
    renderAt();
    await screen.findByText('Mouse');
    expect(screen.getByRole('button', { name: /refund/i })).toBeInTheDocument();
  });

  it('shows no transition buttons for a terminal order', async () => {
    getOrder.mockResolvedValue(detail({ status: 'CANCELLED' }));
    renderAt();
    await screen.findByText('Mouse');
    expect(
      screen.queryByRole('button', { name: /confirm|cancel|ship|deliver|refund/i }),
    ).not.toBeInTheDocument();
  });

  it('shows a not-found state when the order is missing', async () => {
    getOrder.mockRejectedValue(new ApiError(404, 'not found'));
    renderAt('missing');
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });
});
