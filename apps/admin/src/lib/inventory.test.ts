import { describe, it, expect, beforeEach, vi } from 'vitest';

const request = vi.fn();
vi.mock('./apiClient', () => ({
  apiClient: { request: (...a: unknown[]) => request(...a) },
}));

import { listStock, getStockItem, createMovement } from './inventory';

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({
    data: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });
});

describe('listStock', () => {
  it('GETs /inventory with no query by default', async () => {
    await listStock({});
    expect(request).toHaveBeenCalledWith('/inventory');
  });

  it('includes page and pageSize', async () => {
    await listStock({ page: 2, pageSize: 20 });
    expect(request).toHaveBeenCalledWith('/inventory?page=2&pageSize=20');
  });

  it('includes lowStock=true when filtering', async () => {
    await listStock({ lowStock: true });
    expect(request).toHaveBeenCalledWith('/inventory?lowStock=true');
  });

  it('omits lowStock when false', async () => {
    await listStock({ lowStock: false, page: 1 });
    expect(request).toHaveBeenCalledWith('/inventory?page=1');
  });
});

describe('getStockItem', () => {
  it('GETs /inventory/:id', async () => {
    request.mockResolvedValue({ productId: 'p1', movements: [] });
    await getStockItem('p1');
    expect(request).toHaveBeenCalledWith('/inventory/p1');
  });
});

describe('createMovement', () => {
  it('POSTs a movement to /inventory/:id/movements', async () => {
    request.mockResolvedValue(undefined);
    await createMovement('p1', {
      type: 'ADDITION',
      quantity: 5,
      reason: 'restock',
    });
    expect(request).toHaveBeenCalledWith('/inventory/p1/movements', {
      method: 'POST',
      body: JSON.stringify({ type: 'ADDITION', quantity: 5, reason: 'restock' }),
    });
  });
});
