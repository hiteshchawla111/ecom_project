import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from './apiClient';
import {
  listSellerStock,
  getSellerStockItem,
  createSellerMovement,
} from './sellerInventory';

vi.mock('./apiClient', () => ({ apiClient: { request: vi.fn() } }));

describe('sellerInventory client', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listSellerStock GETs /seller/inventory with pagination + lowStock', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [], page: 1, pageSize: 20, total: 0, totalPages: 1,
    });
    await listSellerStock({ page: 2, pageSize: 10, lowStock: true });
    expect(apiClient.request).toHaveBeenCalledWith(
      '/seller/inventory?page=2&pageSize=10&lowStock=true',
    );
  });

  it('getSellerStockItem GETs /seller/inventory/:productId', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({});
    await getSellerStockItem('p1');
    expect(apiClient.request).toHaveBeenCalledWith('/seller/inventory/p1');
  });

  it('createSellerMovement POSTs /seller/inventory/:productId/movements', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    await createSellerMovement('p1', { type: 'ADDITION', quantity: 5, reason: 'restock' });
    expect(apiClient.request).toHaveBeenCalledWith('/seller/inventory/p1/movements', {
      method: 'POST',
      body: JSON.stringify({ type: 'ADDITION', quantity: 5, reason: 'restock' }),
    });
  });
});
