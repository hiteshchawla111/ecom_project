import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductForm } from './ProductForm';
import type { CategoryOption } from '../../lib/categories';
import type { Product } from '../../lib/products';

const categories: CategoryOption[] = [
  { id: 'c1', label: 'Electronics' },
  { id: 'c2', label: '— Phones' },
];

const existing: Product = {
  id: 'p1',
  name: 'Aurora Phone',
  sku: 'PH-001',
  description: 'A phone',
  price: '799',
  salePrice: '699',
  brand: 'Aurora',
  status: 'ACTIVE',
  categoryId: 'c2',
};

beforeEach(() => vi.clearAllMocks());

describe('ProductForm — create mode', () => {
  it('shows an editable SKU field and submits a create payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ProductForm mode="create" categories={categories} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/name/i), 'Widget');
    await userEvent.type(screen.getByLabelText(/sku/i), 'WID-1');
    await userEvent.type(screen.getByLabelText(/description/i), 'A widget');
    await userEvent.type(screen.getByLabelText(/^price/i), '19.99');
    await userEvent.selectOptions(screen.getByLabelText(/category/i), 'c1');
    await userEvent.click(screen.getByRole('button', { name: /save|create/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Widget',
        sku: 'WID-1',
        description: 'A widget',
        price: 19.99,
        categoryId: 'c1',
      }),
    );
  });

  it('blocks submit and shows validation errors when required fields are empty', async () => {
    const onSubmit = vi.fn();
    render(<ProductForm mode="create" categories={categories} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: /save|create/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/name is required/i)).toBeInTheDocument();
  });
});

describe('ProductForm — edit mode', () => {
  it('prefills fields and hides the SKU field (SKU is immutable)', () => {
    render(
      <ProductForm
        mode="edit"
        categories={categories}
        initial={existing}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/name/i)).toHaveValue('Aurora Phone');
    expect(screen.getByLabelText(/description/i)).toHaveValue('A phone');
    expect(screen.getByLabelText(/^price/i)).toHaveValue(799);
    expect(screen.getByLabelText(/category/i)).toHaveValue('c2');
    // SKU is shown read-only or not editable in edit mode.
    expect(screen.queryByLabelText(/sku/i)).not.toBeInTheDocument();
  });

  it('submits an update payload without sku', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ProductForm
        mode="edit"
        categories={categories}
        initial={existing}
        onSubmit={onSubmit}
      />,
    );

    await userEvent.clear(screen.getByLabelText(/name/i));
    await userEvent.type(screen.getByLabelText(/name/i), 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.name).toBe('Renamed');
    expect('sku' in payload).toBe(false);
  });

  it('surfaces a submit error to the user', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
    render(
      <ProductForm
        mode="edit"
        categories={categories}
        initial={existing}
        onSubmit={onSubmit}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
