import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { StockItemView } from '../lib/inventory';
import { ApiError } from '../lib/types';

const getStockItem = vi.fn();
const createMovement = vi.fn();
vi.mock('../lib/inventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/inventory')>();
  return {
    ...actual,
    getStockItem: (...a: unknown[]) => getStockItem(...a),
    createMovement: (...a: unknown[]) => createMovement(...a),
  };
});

import { InventoryItemPage } from './InventoryItemPage';

const item = (over: Partial<StockItemView> = {}): StockItemView => ({
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
    <MemoryRouter initialEntries={[`/inventory/${id}`]}>
      <Routes>
        <Route path="/inventory/:productId" element={<InventoryItemPage />} />
        <Route path="/inventory" element={<div>inventory list</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  getStockItem.mockReset();
  createMovement.mockReset();
});

describe('InventoryItemPage', () => {
  it('renders the item summary and movement history', async () => {
    getStockItem.mockResolvedValue(item());
    renderAt();

    expect(await screen.findByText('Aurora Phone')).toBeInTheDocument();
    expect(screen.getByText('PH-001')).toBeInTheDocument();
    // movement history row (type rendered with a humanized label)
    expect(screen.getByText('Reservation')).toBeInTheDocument();
  });

  it('submits an adjustment then refetches the item', async () => {
    getStockItem.mockResolvedValueOnce(item({ available: 8 }));
    createMovement.mockResolvedValue(undefined);
    getStockItem.mockResolvedValueOnce(item({ available: 13 }));
    renderAt();
    await screen.findByText('Aurora Phone');

    await userEvent.selectOptions(screen.getByLabelText(/type/i), 'ADDITION');
    await userEvent.type(screen.getByLabelText(/quantity/i), '5');
    await userEvent.type(screen.getByLabelText(/reason/i), 'restock');
    await userEvent.click(screen.getByRole('button', { name: /post movement|adjust|submit/i }));

    await waitFor(() =>
      expect(createMovement).toHaveBeenCalledWith('p1', {
        type: 'ADDITION',
        quantity: 5,
        reason: 'restock',
      }),
    );
    // refetched (second getStockItem call)
    await waitFor(() => expect(getStockItem).toHaveBeenCalledTimes(2));
  });

  it('requires a reason before submitting', async () => {
    getStockItem.mockResolvedValue(item());
    renderAt();
    await screen.findByText('Aurora Phone');

    await userEvent.selectOptions(screen.getByLabelText(/type/i), 'ADDITION');
    await userEvent.type(screen.getByLabelText(/quantity/i), '5');
    // no reason
    await userEvent.click(screen.getByRole('button', { name: /post movement|adjust|submit/i }));

    expect(createMovement).not.toHaveBeenCalled();
  });

  it('surfaces an API error from the adjustment (e.g. oversell)', async () => {
    getStockItem.mockResolvedValue(item({ available: 1 }));
    createMovement.mockRejectedValue(new ApiError(400, 'bad'));
    renderAt();
    await screen.findByText('Aurora Phone');

    await userEvent.selectOptions(screen.getByLabelText(/type/i), 'DEDUCTION');
    await userEvent.type(screen.getByLabelText(/quantity/i), '5');
    await userEvent.type(screen.getByLabelText(/reason/i), 'damaged');
    await userEvent.click(screen.getByRole('button', { name: /post movement|adjust|submit/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('shows a not-found state for a missing item', async () => {
    getStockItem.mockRejectedValue(new ApiError(404, 'nf'));
    renderAt('missing');
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });
});
