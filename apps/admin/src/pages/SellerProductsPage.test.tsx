import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Paginated, Product } from '../lib/products';

const listSellerProducts = vi.fn();
const archiveSellerProduct = vi.fn();
const setSellerProductActive = vi.fn();

vi.mock('../lib/sellerProducts', () => ({
  listSellerProducts: (...a: unknown[]) => listSellerProducts(...a),
  archiveSellerProduct: (...a: unknown[]) => archiveSellerProduct(...a),
  setSellerProductActive: (...a: unknown[]) => setSellerProductActive(...a),
}));

import { SellerProductsPage } from './SellerProductsPage';

const renderPage = () =>
  render(
    <MemoryRouter>
      <SellerProductsPage />
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

const page = (
  data: Product[],
  over: Partial<Paginated<Product>> = {},
): Paginated<Product> => ({
  data,
  page: 1,
  pageSize: 20,
  total: data.length,
  totalPages: 1,
  ...over,
});

beforeEach(() => {
  listSellerProducts.mockReset();
  archiveSellerProduct.mockReset();
  setSellerProductActive.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('SellerProductsPage', () => {
  it('loads and renders products in a table', async () => {
    listSellerProducts.mockResolvedValue(page([product()]));
    renderPage();

    expect(await screen.findByText('Aurora Phone')).toBeInTheDocument();
    expect(screen.getByText('PH-001')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows an empty state when there are no products', async () => {
    listSellerProducts.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText(/no products/i)).toBeInTheDocument();
  });

  it('"Add product" link points to /seller/products/new', async () => {
    listSellerProducts.mockResolvedValue(page([product()]));
    renderPage();
    await screen.findByText('Aurora Phone');
    const addLink = screen.getByRole('link', { name: /add product/i });
    expect(addLink).toHaveAttribute('href', '/seller/products/new');
  });

  it('links to the CSV import page', async () => {
    listSellerProducts.mockResolvedValue(page([product()]));
    renderPage();
    await screen.findByText('Aurora Phone');
    expect(screen.getByRole('link', { name: /import csv/i })).toHaveAttribute(
      'href',
      '/seller/products/import',
    );
  });

  it('edit action link points to /seller/products/:id/edit', async () => {
    listSellerProducts.mockResolvedValue(page([product()]));
    renderPage();
    const row = (await screen.findByText('Aurora Phone')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /actions for/i }));
    const editLink = within(row).getByRole('link', { name: /edit/i });
    expect(editLink).toHaveAttribute('href', '/seller/products/p1/edit');
  });

  it('archives a product after confirmation and reloads', async () => {
    listSellerProducts
      .mockResolvedValueOnce(page([product({ status: 'ACTIVE' })]))
      .mockResolvedValueOnce(page([product({ status: 'ARCHIVED' })]));
    archiveSellerProduct.mockResolvedValue(product({ status: 'ARCHIVED' }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();
    const row = (await screen.findByText('Aurora Phone')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /actions for/i }));
    await userEvent.click(within(row).getByRole('button', { name: /archive/i }));

    await waitFor(() => expect(archiveSellerProduct).toHaveBeenCalledWith('p1'));
    expect(listSellerProducts).toHaveBeenCalledTimes(2); // reloaded
  });

  it('does not archive when confirmation is cancelled', async () => {
    listSellerProducts.mockResolvedValue(page([product({ status: 'ACTIVE' })]));
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderPage();
    const row = (await screen.findByText('Aurora Phone')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /actions for/i }));
    await userEvent.click(within(row).getByRole('button', { name: /archive/i }));

    expect(archiveSellerProduct).not.toHaveBeenCalled();
  });

  it('deactivates an active product', async () => {
    listSellerProducts
      .mockResolvedValueOnce(page([product({ status: 'ACTIVE' })]))
      .mockResolvedValueOnce(page([product({ status: 'INACTIVE' })]));
    setSellerProductActive.mockResolvedValue(product({ status: 'INACTIVE' }));

    renderPage();
    const row = (await screen.findByText('Aurora Phone')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /actions for/i }));
    await userEvent.click(
      within(row).getByRole('button', { name: /deactivate/i }),
    );

    await waitFor(() => expect(setSellerProductActive).toHaveBeenCalledWith('p1', false));
  });

  it('activates an inactive product', async () => {
    listSellerProducts
      .mockResolvedValueOnce(page([product({ status: 'INACTIVE' })]))
      .mockResolvedValueOnce(page([product({ status: 'ACTIVE' })]));
    setSellerProductActive.mockResolvedValue(product({ status: 'ACTIVE' }));

    renderPage();
    const row = (await screen.findByText('Aurora Phone')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /actions for/i }));
    await userEvent.click(within(row).getByRole('button', { name: /activate/i }));

    await waitFor(() => expect(setSellerProductActive).toHaveBeenCalledWith('p1', true));
  });

  it('shows an error message when loading fails', async () => {
    listSellerProducts.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('retries the fetch when "Try again" is clicked after an error', async () => {
    listSellerProducts
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(page([product()]));
    renderPage();

    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('Aurora Phone')).toBeInTheDocument();
    expect(listSellerProducts).toHaveBeenCalledTimes(2);
  });

  it('shows the total count and paginates when there is more than one page', async () => {
    listSellerProducts.mockResolvedValue(
      page([product()], { total: 45, totalPages: 3 }),
    );
    renderPage();

    expect(await screen.findByText('Aurora Phone')).toBeInTheDocument();
    expect(screen.getByText(/of 45/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
  });

  it('refetches with the new page when a page button is clicked', async () => {
    listSellerProducts
      .mockResolvedValueOnce(page([product()], { total: 45, totalPages: 3 }))
      .mockResolvedValueOnce(
        page([product({ id: 'p2', name: 'Beta Phone' })], {
          page: 2,
          total: 45,
          totalPages: 3,
        }),
      );
    renderPage();

    await screen.findByText('Aurora Phone');
    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }));

    await waitFor(() =>
      expect(listSellerProducts).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 }),
    );
    expect(await screen.findByText('Beta Phone')).toBeInTheDocument();
  });

  it('steps back a page when the current page becomes empty', async () => {
    listSellerProducts
      .mockResolvedValueOnce(page([product()], { total: 21, totalPages: 2 }))
      .mockResolvedValueOnce(page([], { page: 2, total: 21, totalPages: 2 }))
      .mockResolvedValueOnce(page([product()], { total: 21, totalPages: 2 }));
    renderPage();

    await screen.findByText('Aurora Phone');
    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }));

    await waitFor(() =>
      expect(listSellerProducts).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 }),
    );
  });
});
