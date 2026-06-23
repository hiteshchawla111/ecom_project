import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Product } from '../lib/products';

const listCategories = vi.fn();
const getSellerProduct = vi.fn();
const updateSellerProduct = vi.fn();

vi.mock('../lib/categories', async (orig) => ({
  ...(await orig<typeof import('../lib/categories')>()),
  listCategories: () => listCategories(),
}));
vi.mock('../lib/sellerProducts', () => ({
  getSellerProduct: (...a: unknown[]) => getSellerProduct(...a),
  updateSellerProduct: (...a: unknown[]) => updateSellerProduct(...a),
}));

import { SellerProductEditPage } from './SellerProductEditPage';

const existing: Product = {
  id: 'p1',
  name: 'Aurora Phone',
  sku: 'PH-001',
  description: 'A phone',
  price: '799',
  salePrice: null,
  brand: 'Aurora',
  status: 'ACTIVE',
  categoryId: 'c1',
};

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/seller/products/:id/edit', element: <SellerProductEditPage /> },
      { path: '/seller/products', element: <div>SELLER PRODUCTS LIST</div> },
    ],
    { initialEntries: ['/seller/products/p1/edit'] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  listCategories.mockResolvedValue([
    { id: 'c1', name: 'Electronics', slug: 'electronics', parentId: null, children: [] },
  ]);
  getSellerProduct.mockResolvedValue(existing);
});

describe('SellerProductEditPage', () => {
  it('loads the seller product, prefills the form, updates and navigates back', async () => {
    updateSellerProduct.mockResolvedValue(existing);
    renderPage();

    await waitFor(() =>
      expect(screen.getByLabelText(/name/i)).toHaveValue('Aurora Phone'),
    );
    expect(getSellerProduct).toHaveBeenCalledWith('p1');

    await userEvent.clear(screen.getByLabelText(/name/i));
    await userEvent.type(screen.getByLabelText(/name/i), 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(updateSellerProduct).toHaveBeenCalledTimes(1));
    expect(updateSellerProduct).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ name: 'Renamed' }),
    );
    await waitFor(() =>
      expect(screen.getByText('SELLER PRODUCTS LIST')).toBeInTheDocument(),
    );
  });
});
