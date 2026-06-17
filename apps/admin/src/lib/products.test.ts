import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient } from './apiClient';
import {
  archiveProduct,
  listProducts,
  setProductActive,
} from './products';

const requestMock = vi.spyOn(apiClient, 'request');

beforeEach(() => requestMock.mockReset());

describe('listProducts', () => {
  it('requests /products with pagination and returns the envelope', async () => {
    requestMock.mockResolvedValue({
      data: [],
      page: 2,
      pageSize: 20,
      total: 0,
      totalPages: 1,
    });

    const res = await listProducts({ page: 2, pageSize: 20 });

    const path = requestMock.mock.calls[0][0] as string;
    expect(path).toContain('/products');
    expect(path).toContain('page=2');
    expect(path).toContain('pageSize=20');
    expect(res.page).toBe(2);
  });

  it('omits undefined query params', async () => {
    requestMock.mockResolvedValue({
      data: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 1,
    });

    await listProducts({});

    const path = requestMock.mock.calls[0][0] as string;
    expect(path).not.toContain('undefined');
    expect(path).not.toContain('page=');
  });
});

describe('archiveProduct', () => {
  it('POSTs to /products/:id/archive', async () => {
    requestMock.mockResolvedValue({ id: 'p1', status: 'ARCHIVED' });

    await archiveProduct('p1');

    expect(requestMock).toHaveBeenCalledWith(
      '/products/p1/archive',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('setProductActive', () => {
  it('PATCHes /products/:id/active with active=true', async () => {
    requestMock.mockResolvedValue({ id: 'p1', status: 'ACTIVE' });

    await setProductActive('p1', true);

    const [path, init] = requestMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/products/p1/active');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ active: true });
  });

  it('PATCHes with active=false to deactivate', async () => {
    requestMock.mockResolvedValue({ id: 'p1', status: 'INACTIVE' });

    await setProductActive('p1', false);

    const [, init] = requestMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ active: false });
  });
});
