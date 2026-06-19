import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { AdminOrderSummary, Paginated } from '../lib/orders';

const listOrders = vi.fn();
vi.mock('../lib/orders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/orders')>();
  return { ...actual, listOrders: (...a: unknown[]) => listOrders(...a) };
});

import { OrdersPage } from './OrdersPage';

const renderPage = () =>
  render(
    <MemoryRouter>
      <OrdersPage />
    </MemoryRouter>,
  );

const order = (over: Partial<AdminOrderSummary> = {}): AdminOrderSummary => ({
  id: 'o1',
  status: 'PENDING',
  grandTotal: '48.98',
  itemCount: 2,
  customerEmail: 'ada@shop.test',
  customerName: 'Ada Lovelace',
  createdAt: '2026-06-18T12:00:00.000Z',
  ...over,
});

const page = (
  data: AdminOrderSummary[],
  over: Partial<Paginated<AdminOrderSummary>> = {},
): Paginated<AdminOrderSummary> => ({
  data,
  page: 1,
  pageSize: 20,
  total: data.length,
  totalPages: 1,
  ...over,
});

beforeEach(() => {
  listOrders.mockReset();
});

describe('OrdersPage', () => {
  it('lists orders with customer, status, total, and item count', async () => {
    listOrders.mockResolvedValue(page([order()]));
    renderPage();

    const row = await screen.findByText('ada@shop.test');
    const tr = row.closest('tr')!;
    expect(within(tr).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(tr).getByText('Pending')).toBeInTheDocument();
    expect(within(tr).getByText(/48\.98/)).toBeInTheDocument();
    expect(within(tr).getByText('2')).toBeInTheDocument();
  });

  it('shows an empty state when there are no orders', async () => {
    listOrders.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText(/no orders/i)).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    listOrders.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('refetches with a status filter when the status select changes', async () => {
    listOrders.mockResolvedValue(page([order()]));
    renderPage();
    await screen.findByText('ada@shop.test');

    listOrders.mockResolvedValue(page([order({ status: 'SHIPPED' })]));
    await userEvent.selectOptions(
      screen.getByLabelText(/status/i),
      'SHIPPED',
    );

    await waitFor(() =>
      expect(listOrders).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'SHIPPED', page: 1 }),
      ),
    );
  });

  it('refetches when the page changes via pagination', async () => {
    listOrders.mockResolvedValue(page([order()], { total: 40, totalPages: 2 }));
    renderPage();
    await screen.findByText('ada@shop.test');

    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }));

    await waitFor(() =>
      expect(listOrders).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );
  });
});
