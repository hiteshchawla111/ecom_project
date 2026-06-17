import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoryEditForm } from './CategoryEditForm';
import type { CategoryOption } from '../../lib/categories';

const options: CategoryOption[] = [
  { id: 'c1', label: 'Electronics' },
  { id: 'c2', label: '— Phones' },
  { id: 'c3', label: 'Books' },
];

const category = {
  id: 'c2',
  name: 'Phones',
  slug: 'phones',
  parentId: 'c1',
};

beforeEach(() => vi.clearAllMocks());

describe('CategoryEditForm', () => {
  it('prefills name, slug and parent from the category', () => {
    render(
      <CategoryEditForm
        category={category}
        parentOptions={options}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/name/i)).toHaveValue('Phones');
    expect(screen.getByLabelText(/slug/i)).toHaveValue('phones');
    expect(screen.getByLabelText(/parent/i)).toHaveValue('c1');
  });

  it('excludes the category itself from the parent options (no self-parent)', () => {
    render(
      <CategoryEditForm
        category={category}
        parentOptions={options}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // c2 (Phones, itself) must not be selectable as its own parent.
    expect(
      screen.queryByRole('option', { name: /phones/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /books/i })).toBeInTheDocument();
  });

  it('submits the edited fields including a reparent', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <CategoryEditForm
        category={category}
        parentOptions={options}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.clear(screen.getByLabelText(/name/i));
    await userEvent.type(screen.getByLabelText(/name/i), 'Smartphones');
    await userEvent.selectOptions(screen.getByLabelText(/parent/i), 'c3');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Smartphones',
      slug: 'phones',
      parentId: 'c3',
    });
  });

  it('sends parentId null when detaching to root', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <CategoryEditForm
        category={category}
        parentOptions={options}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.selectOptions(screen.getByLabelText(/parent/i), '');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ parentId: null });
  });

  it('surfaces a submit error', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
    render(
      <CategoryEditForm
        category={category}
        parentOptions={options}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('cancels via the cancel button', async () => {
    const onCancel = vi.fn();
    render(
      <CategoryEditForm
        category={category}
        parentOptions={options}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
