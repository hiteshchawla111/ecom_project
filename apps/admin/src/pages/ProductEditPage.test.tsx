import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Product } from '../lib/products';

const listCategories = vi.fn();
const getProduct = vi.fn();
const updateProduct = vi.fn();

vi.mock('../lib/categories', async (orig) => ({
  ...(await orig<typeof import('../lib/categories')>()),
  listCategories: () => listCategories(),
}));
vi.mock('../lib/products', () => ({
  getProduct: (...a: unknown[]) => getProduct(...a),
  updateProduct: (...a: unknown[]) => updateProduct(...a),
}));

import { ProductEditPage } from './ProductEditPage';

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
      { path: '/products/:id/edit', element: <ProductEditPage /> },
      { path: '/products', element: <div>PRODUCTS LIST</div> },
    ],
    { initialEntries: ['/products/p1/edit'] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  listCategories.mockResolvedValue([
    { id: 'c1', name: 'Electronics', slug: 'electronics', parentId: null, children: [] },
  ]);
  getProduct.mockResolvedValue(existing);
});

describe('ProductEditPage', () => {
  it('loads the product, prefills the form, updates and navigates back', async () => {
    updateProduct.mockResolvedValue(existing);
    renderPage();

    await waitFor(() =>
      expect(screen.getByLabelText(/name/i)).toHaveValue('Aurora Phone'),
    );
    expect(getProduct).toHaveBeenCalledWith('p1');

    await userEvent.clear(screen.getByLabelText(/name/i));
    await userEvent.type(screen.getByLabelText(/name/i), 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1));
    expect(updateProduct).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ name: 'Renamed' }),
    );
    await waitFor(() =>
      expect(screen.getByText('PRODUCTS LIST')).toBeInTheDocument(),
    );
  });
});
