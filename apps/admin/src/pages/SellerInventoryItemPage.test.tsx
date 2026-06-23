import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { SellerStockItemView } from '../lib/sellerInventory';
import { ApiError } from '../lib/types';

const getSellerStockItem = vi.fn();
const createSellerMovement = vi.fn();
vi.mock('../lib/sellerInventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/sellerInventory')>();
  return {
    ...actual,
    getSellerStockItem: (...a: unknown[]) => getSellerStockItem(...a),
    createSellerMovement: (...a: unknown[]) => createSellerMovement(...a),
  };
});

import { SellerInventoryItemPage } from './SellerInventoryItemPage';

const item = (over: Partial<SellerStockItemView> = {}): SellerStockItemView => ({
  productId: 'p1',
  name: 'Aurora Phone',
  sku: 'PH-001',
  available: 8,
  reserved: 2,
  lowStockThreshold: 5,
  isLowStock: false,
  movements: [
    {
      type: 'RESERVATION',
      quantity: -2,
      reason: null,
      orderId: 'o1',
      createdAt: '2026-06-18T10:00:00.000Z',
    },
  ],
  ...over,
});

const renderAt = (id = 'p1') =>
  render(
    <MemoryRouter initialEntries={[`/seller/inventory/${id}`]}>
      <Routes>
        <Route path="/seller/inventory/:productId" element={<SellerInventoryItemPage />} />
        <Route path="/seller/inventory" element={<div>seller inventory list</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  getSellerStockItem.mockReset();
  createSellerMovement.mockReset();
});

describe('SellerInventoryItemPage', () => {
  it('renders the item summary and movement history', async () => {
    getSellerStockItem.mockResolvedValue(item());
    renderAt();

    expect(await screen.findByText('Aurora Phone')).toBeInTheDocument();
    expect(screen.getByText('PH-001')).toBeInTheDocument();
    // movement history row (type rendered with a humanized label)
    expect(screen.getByText('Reservation')).toBeInTheDocument();
  });

  it('submits an adjustment then refetches the item', async () => {
    getSellerStockItem.mockResolvedValueOnce(item({ available: 8 }));
    createSellerMovement.mockResolvedValue(undefined);
    getSellerStockItem.mockResolvedValueOnce(item({ available: 13 }));
    renderAt();
    await screen.findByText('Aurora Phone');

    await userEvent.selectOptions(screen.getByLabelText(/type/i), 'ADDITION');
    await userEvent.type(screen.getByLabelText(/quantity/i), '5');
    await userEvent.type(screen.getByLabelText(/reason/i), 'restock');
    await userEvent.click(screen.getByRole('button', { name: /post movement|adjust|submit/i }));

    await waitFor(() =>
      expect(createSellerMovement).toHaveBeenCalledWith('p1', {
        type: 'ADDITION',
        quantity: 5,
        reason: 'restock',
      }),
    );
    // refetched (second getSellerStockItem call)
    await waitFor(() => expect(getSellerStockItem).toHaveBeenCalledTimes(2));
  });

  it('requires a reason before submitting', async () => {
    getSellerStockItem.mockResolvedValue(item());
    renderAt();
    await screen.findByText('Aurora Phone');

    await userEvent.selectOptions(screen.getByLabelText(/type/i), 'ADDITION');
    await userEvent.type(screen.getByLabelText(/quantity/i), '5');
    // no reason
    await userEvent.click(screen.getByRole('button', { name: /post movement|adjust|submit/i }));

    expect(createSellerMovement).not.toHaveBeenCalled();
  });

  it('surfaces an API error from the adjustment (e.g. oversell)', async () => {
    getSellerStockItem.mockResolvedValue(item({ available: 1 }));
    createSellerMovement.mockRejectedValue(new ApiError(400, 'bad'));
    renderAt();
    await screen.findByText('Aurora Phone');

    await userEvent.selectOptions(screen.getByLabelText(/type/i), 'DEDUCTION');
    await userEvent.type(screen.getByLabelText(/quantity/i), '5');
    await userEvent.type(screen.getByLabelText(/reason/i), 'damaged');
    await userEvent.click(screen.getByRole('button', { name: /post movement|adjust|submit/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('shows a not-found state for a missing item', async () => {
    getSellerStockItem.mockRejectedValue(new ApiError(404, 'nf'));
    renderAt('missing');
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });

  it('back link points to /seller/inventory', async () => {
    getSellerStockItem.mockResolvedValue(item());
    renderAt();
    await screen.findByText('Aurora Phone');

    const backLink = screen.getByRole('link', { name: /back to inventory/i });
    expect(backLink).toHaveAttribute('href', '/seller/inventory');
  });
});
