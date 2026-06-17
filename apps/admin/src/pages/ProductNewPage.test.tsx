import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

const listCategories = vi.fn();
const createProduct = vi.fn();

vi.mock('../lib/categories', async (orig) => ({
  ...(await orig<typeof import('../lib/categories')>()),
  listCategories: () => listCategories(),
}));
vi.mock('../lib/products', () => ({
  createProduct: (...a: unknown[]) => createProduct(...a),
}));

import { ProductNewPage } from './ProductNewPage';

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/products/new', element: <ProductNewPage /> },
      { path: '/products', element: <div>PRODUCTS LIST</div> },
    ],
    { initialEntries: ['/products/new'] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  listCategories.mockResolvedValue([
    { id: 'c1', name: 'Electronics', slug: 'electronics', parentId: null, children: [] },
  ]);
});

describe('ProductNewPage', () => {
  it('creates a product and navigates back to the list', async () => {
    createProduct.mockResolvedValue({ id: 'new' });
    renderPage();

    // Category select is populated once categories load.
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /electronics/i })).toBeInTheDocument(),
    );

    await userEvent.type(screen.getByLabelText(/name/i), 'Widget');
    await userEvent.type(screen.getByLabelText(/sku/i), 'WID-1');
    await userEvent.type(screen.getByLabelText(/description/i), 'A widget');
    await userEvent.type(screen.getByLabelText(/^price/i), '12');
    await userEvent.selectOptions(screen.getByLabelText(/category/i), 'c1');
    await userEvent.click(screen.getByRole('button', { name: /create product/i }));

    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText('PRODUCTS LIST')).toBeInTheDocument(),
    );
  });
});
