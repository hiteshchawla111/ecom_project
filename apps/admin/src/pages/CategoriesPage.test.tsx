import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../lib/types';
import type { Category } from '../lib/categories';

const listCategories = vi.fn();
const createCategory = vi.fn();
const deleteCategory = vi.fn();
const updateCategory = vi.fn();

vi.mock('../lib/categories', async (orig) => ({
  ...(await orig<typeof import('../lib/categories')>()),
  listCategories: () => listCategories(),
  createCategory: (...a: unknown[]) => createCategory(...a),
  deleteCategory: (...a: unknown[]) => deleteCategory(...a),
  updateCategory: (...a: unknown[]) => updateCategory(...a),
}));

import { CategoriesPage } from './CategoriesPage';

const tree: Category[] = [
  {
    id: 'c1',
    name: 'Electronics',
    slug: 'electronics',
    parentId: null,
    children: [
      { id: 'c2', name: 'Phones', slug: 'phones', parentId: 'c1', children: [] },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  listCategories.mockResolvedValue(tree);
});
afterEach(() => vi.restoreAllMocks());

describe('CategoriesPage', () => {
  it('renders the category hierarchy', async () => {
    render(<CategoriesPage />);
    // "Electronics"/"Phones" appear both as tree nodes and as parent <option>s;
    // assert the tree node (rendered inside an <li>) specifically.
    const phonesNode = (await screen.findByText('Phones', { selector: 'span' }))
      .closest('li');
    expect(phonesNode).toBeInTheDocument();
    expect(screen.getByText('Electronics', { selector: 'span' })).toBeInTheDocument();
  });

  it('creates a category and reloads the tree', async () => {
    createCategory.mockResolvedValue({ id: 'c3' });
    render(<CategoriesPage />);
    await screen.findByText('Electronics', { selector: 'span' });

    await userEvent.type(screen.getByLabelText(/name/i), 'Books');
    await userEvent.type(screen.getByLabelText(/slug/i), 'books');
    await userEvent.click(screen.getByRole('button', { name: /add category/i }));

    await waitFor(() =>
      expect(createCategory).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Books', slug: 'books' }),
      ),
    );
    expect(listCategories).toHaveBeenCalledTimes(2); // reloaded
  });

  it('deletes a category after confirmation', async () => {
    deleteCategory.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CategoriesPage />);
    const node = (await screen.findByText('Phones')).closest('li')!;

    await userEvent.click(within(node).getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(deleteCategory).toHaveBeenCalledWith('c2'));
  });

  it('does not delete when confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<CategoriesPage />);
    const node = (await screen.findByText('Phones')).closest('li')!;

    await userEvent.click(within(node).getByRole('button', { name: /delete/i }));

    expect(deleteCategory).not.toHaveBeenCalled();
  });

  it('shows a clear message when delete is blocked (409 in use)', async () => {
    deleteCategory.mockRejectedValue(new ApiError(409, 'in use'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CategoriesPage />);
    const node = (await screen.findByText('Phones')).closest('li')!;

    await userEvent.click(within(node).getByRole('button', { name: /delete/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/in use|subcategories|products/i);
  });

  it('edits a category (rename) and reloads', async () => {
    updateCategory.mockResolvedValue({ id: 'c2' });
    render(<CategoriesPage />);
    const node = (await screen.findByText('Phones', { selector: 'span' })).closest(
      'li',
    )!;

    await userEvent.click(within(node).getByRole('button', { name: /^edit$/i }));
    const nameInput = within(node).getByLabelText(/name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Smartphones');
    await userEvent.click(within(node).getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(updateCategory).toHaveBeenCalledWith(
        'c2',
        expect.objectContaining({ name: 'Smartphones' }),
      ),
    );
    expect(listCategories).toHaveBeenCalledTimes(2); // reloaded
  });

  it('shows a validation message when create fails with 409 (duplicate slug)', async () => {
    createCategory.mockRejectedValue(new ApiError(409, 'dup'));
    render(<CategoriesPage />);
    await screen.findByText('Electronics', { selector: 'span' });

    await userEvent.type(screen.getByLabelText(/name/i), 'Dup');
    await userEvent.type(screen.getByLabelText(/slug/i), 'electronics');
    await userEvent.click(screen.getByRole('button', { name: /add category/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/slug/i);
  });
});
