import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Paginated, StockRow } from '../lib/inventory';

const listStock = vi.fn();
vi.mock('../lib/inventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/inventory')>();
  return { ...actual, listStock: (...a: unknown[]) => listStock(...a) };
});

import { InventoryPage } from './InventoryPage';

const renderPage = () =>
  render(
    <MemoryRouter>
      <InventoryPage />
    </MemoryRouter>,
  );

const row = (over: Partial<StockRow> = {}): StockRow => ({
  productId: 'p1',
  name: 'Aurora Phone',
  sku: 'PH-001',
  available: 8,
  reserved: 2,
  lowStockThreshold: 5,
  isLowStock: false,
  ...over,
});

const page = (
  data: StockRow[],
  over: Partial<Paginated<StockRow>> = {},
): Paginated<StockRow> => ({
  data,
  page: 1,
  pageSize: 20,
  total: data.length,
  totalPages: 1,
  ...over,
});

beforeEach(() => {
  listStock.mockReset();
});

describe('InventoryPage', () => {
  it('lists stock with available, reserved, threshold', async () => {
    listStock.mockResolvedValue(page([row()]));
    renderPage();

    const sku = await screen.findByText('PH-001');
    const tr = sku.closest('tr')!;
    expect(within(tr).getByText('Aurora Phone')).toBeInTheDocument();
    expect(within(tr).getByText('8')).toBeInTheDocument(); // available
    expect(within(tr).getByText('2')).toBeInTheDocument(); // reserved
  });

  it('shows a Low badge for low-stock rows', async () => {
    listStock.mockResolvedValue(page([row({ available: 3, isLowStock: true })]));
    renderPage();
    expect(await screen.findByText(/low/i)).toBeInTheDocument();
  });

  it('shows an empty state when there is no stock', async () => {
    listStock.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText(/no inventory|no stock/i)).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    listStock.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('refetches with lowStock=true when the filter is toggled', async () => {
    listStock.mockResolvedValue(page([row()]));
    renderPage();
    await screen.findByText('PH-001');

    listStock.mockResolvedValue(page([row({ available: 3, isLowStock: true })]));
    await userEvent.click(screen.getByLabelText(/low stock only/i));

    await waitFor(() =>
      expect(listStock).toHaveBeenLastCalledWith(
        expect.objectContaining({ lowStock: true, page: 1 }),
      ),
    );
  });

  it('refetches when the page changes', async () => {
    listStock.mockResolvedValue(page([row()], { total: 40, totalPages: 2 }));
    renderPage();
    await screen.findByText('PH-001');

    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    await waitFor(() =>
      expect(listStock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );
  });
});
