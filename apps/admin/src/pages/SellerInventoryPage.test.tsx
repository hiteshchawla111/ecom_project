import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { SellerStockRow } from '../lib/sellerInventory';
import type { Paginated } from '../lib/products';

const listSellerStock = vi.fn();
vi.mock('../lib/sellerInventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/sellerInventory')>();
  return { ...actual, listSellerStock: (...a: unknown[]) => listSellerStock(...a) };
});

import { SellerInventoryPage } from './SellerInventoryPage';

const renderPage = () =>
  render(
    <MemoryRouter>
      <SellerInventoryPage />
    </MemoryRouter>,
  );

const row = (over: Partial<SellerStockRow> = {}): SellerStockRow => ({
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
  data: SellerStockRow[],
  over: Partial<Paginated<SellerStockRow>> = {},
): Paginated<SellerStockRow> => ({
  data,
  page: 1,
  pageSize: 20,
  total: data.length,
  totalPages: 1,
  ...over,
});

beforeEach(() => {
  listSellerStock.mockReset();
});

describe('SellerInventoryPage', () => {
  it('lists stock with available, reserved, threshold', async () => {
    listSellerStock.mockResolvedValue(page([row()]));
    renderPage();

    const sku = await screen.findByText('PH-001');
    const tr = sku.closest('tr')!;
    expect(within(tr).getByText('Aurora Phone')).toBeInTheDocument();
    expect(within(tr).getByText('8')).toBeInTheDocument(); // available
    expect(within(tr).getByText('2')).toBeInTheDocument(); // reserved
  });

  it('shows a Low badge for low-stock rows', async () => {
    listSellerStock.mockResolvedValue(page([row({ available: 3, isLowStock: true })]));
    renderPage();
    expect(await screen.findByText(/low/i)).toBeInTheDocument();
  });

  it('shows an empty state when there is no stock', async () => {
    listSellerStock.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText(/no inventory|no stock/i)).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    listSellerStock.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('refetches with lowStock=true when the filter is toggled', async () => {
    listSellerStock.mockResolvedValue(page([row()]));
    renderPage();
    await screen.findByText('PH-001');

    listSellerStock.mockResolvedValue(page([row({ available: 3, isLowStock: true })]));
    await userEvent.click(screen.getByLabelText(/low stock only/i));

    await waitFor(() =>
      expect(listSellerStock).toHaveBeenLastCalledWith(
        expect.objectContaining({ lowStock: true, page: 1 }),
      ),
    );
  });

  it('refetches when the page changes', async () => {
    listSellerStock.mockResolvedValue(page([row()], { total: 40, totalPages: 2 }));
    renderPage();
    await screen.findByText('PH-001');

    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    await waitFor(() =>
      expect(listSellerStock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );
  });

  it('the detail link points to /seller/inventory/:productId', async () => {
    listSellerStock.mockResolvedValue(page([row({ productId: 'abc-123' })]));
    renderPage();
    await screen.findByText('PH-001');

    const link = screen.getByRole('link', { name: /manage/i });
    expect(link).toHaveAttribute('href', '/seller/inventory/abc-123');
  });
});
