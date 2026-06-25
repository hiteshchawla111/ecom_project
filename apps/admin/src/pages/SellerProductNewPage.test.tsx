import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

const listCategories = vi.fn();
const createSellerProduct = vi.fn();

vi.mock('../lib/categories', async (orig) => ({
  ...(await orig<typeof import('../lib/categories')>()),
  listCategories: () => listCategories(),
}));
vi.mock('../lib/sellerProducts', () => ({
  createSellerProduct: (...a: unknown[]) => createSellerProduct(...a),
}));

import { SellerProductNewPage } from './SellerProductNewPage';

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/seller/products/new', element: <SellerProductNewPage /> },
      { path: '/seller/products', element: <div>SELLER PRODUCTS LIST</div> },
    ],
    { initialEntries: ['/seller/products/new'] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  listCategories.mockResolvedValue([
    { id: 'c1', name: 'Electronics', slug: 'electronics', parentId: null, children: [] },
  ]);
});

describe('SellerProductNewPage', () => {
  it('creates a seller product and navigates back to the seller list', async () => {
    createSellerProduct.mockResolvedValue({ id: 'new' });
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

    await waitFor(() => expect(createSellerProduct).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText('SELLER PRODUCTS LIST')).toBeInTheDocument(),
    );
  });
});
