import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Paginated, Product } from '../lib/products';

const listProducts = vi.fn();
const archiveProduct = vi.fn();
const setProductActive = vi.fn();

vi.mock('../lib/products', () => ({
  listProducts: (...a: unknown[]) => listProducts(...a),
  archiveProduct: (...a: unknown[]) => archiveProduct(...a),
  setProductActive: (...a: unknown[]) => setProductActive(...a),
}));

import { ProductsPage } from './ProductsPage';

const renderPage = () =>
  render(
    <MemoryRouter>
      <ProductsPage />
    </MemoryRouter>,
  );

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Aurora Phone',
  sku: 'PH-001',
  description: 'x',
  price: '799',
  salePrice: null,
  brand: 'Aurora',
  status: 'ACTIVE',
  categoryId: 'c1',
  ...over,
});

const page = (data: Product[]): Paginated<Product> => ({
  data,
  page: 1,
  pageSize: 20,
  total: data.length,
  totalPages: 1,
});

beforeEach(() => {
  listProducts.mockReset();
  archiveProduct.mockReset();
  setProductActive.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('ProductsPage', () => {
  it('loads and renders products in a table', async () => {
    listProducts.mockResolvedValue(page([product()]));
    renderPage();

    expect(await screen.findByText('Aurora Phone')).toBeInTheDocument();
    expect(screen.getByText('PH-001')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows an empty state when there are no products', async () => {
    listProducts.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText(/no products/i)).toBeInTheDocument();
  });

  it('archives a product after confirmation and reloads', async () => {
    listProducts
      .mockResolvedValueOnce(page([product({ status: 'ACTIVE' })]))
      .mockResolvedValueOnce(page([product({ status: 'ARCHIVED' })]));
    archiveProduct.mockResolvedValue(product({ status: 'ARCHIVED' }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();
    const row = (await screen.findByText('Aurora Phone')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /archive/i }));

    await waitFor(() => expect(archiveProduct).toHaveBeenCalledWith('p1'));
    expect(listProducts).toHaveBeenCalledTimes(2); // reloaded
  });

  it('does not archive when confirmation is cancelled', async () => {
    listProducts.mockResolvedValue(page([product({ status: 'ACTIVE' })]));
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderPage();
    const row = (await screen.findByText('Aurora Phone')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /archive/i }));

    expect(archiveProduct).not.toHaveBeenCalled();
  });

  it('deactivates an active product', async () => {
    listProducts
      .mockResolvedValueOnce(page([product({ status: 'ACTIVE' })]))
      .mockResolvedValueOnce(page([product({ status: 'INACTIVE' })]));
    setProductActive.mockResolvedValue(product({ status: 'INACTIVE' }));

    renderPage();
    const row = (await screen.findByText('Aurora Phone')).closest('tr')!;
    await userEvent.click(
      within(row).getByRole('button', { name: /deactivate/i }),
    );

    await waitFor(() => expect(setProductActive).toHaveBeenCalledWith('p1', false));
  });

  it('activates an inactive product', async () => {
    listProducts
      .mockResolvedValueOnce(page([product({ status: 'INACTIVE' })]))
      .mockResolvedValueOnce(page([product({ status: 'ACTIVE' })]));
    setProductActive.mockResolvedValue(product({ status: 'ACTIVE' }));

    renderPage();
    const row = (await screen.findByText('Aurora Phone')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /activate/i }));

    await waitFor(() => expect(setProductActive).toHaveBeenCalledWith('p1', true));
  });

  it('shows an error message when loading fails', async () => {
    listProducts.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
