import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { SellerListRow, Paginated } from '../lib/sellers';

const listSellers = vi.fn();
vi.mock('../lib/sellers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/sellers')>();
  return { ...actual, listSellers: (...a: unknown[]) => listSellers(...a) };
});

import { SellersPage } from './SellersPage';

const renderPage = () =>
  render(
    <MemoryRouter>
      <SellersPage />
    </MemoryRouter>,
  );

const seller = (over: Partial<SellerListRow> = {}): SellerListRow => ({
  id: 's1',
  displayName: 'Acme Store',
  slug: 'acme-store',
  status: 'ACTIVE',
  kycPresent: true,
  createdAt: '2026-06-18T12:00:00.000Z',
  ...over,
});

const pageOf = (
  data: SellerListRow[],
  over: Partial<Paginated<SellerListRow>> = {},
): Paginated<SellerListRow> => ({
  data,
  page: 1,
  pageSize: 20,
  total: data.length,
  totalPages: 1,
  ...over,
});

beforeEach(() => {
  listSellers.mockReset();
});

describe('SellersPage', () => {
  it('renders rows after load with displayName', async () => {
    listSellers.mockResolvedValue(pageOf([seller()]));
    renderPage();

    const name = await screen.findByText('Acme Store');
    const tr = name.closest('tr')!;
    expect(within(tr).getByText('acme-store')).toBeInTheDocument();
    expect(within(tr).getByText('Provided')).toBeInTheDocument();
  });

  it('shows the status badge label for the seller status', async () => {
    listSellers.mockResolvedValue(
      pageOf([seller({ status: 'PENDING_REVIEW' })]),
    );
    renderPage();

    expect(await screen.findByText('Pending review')).toBeInTheDocument();
  });

  it('filters by status and resets page to 1 when status select changes', async () => {
    listSellers.mockResolvedValue(pageOf([seller()]));
    renderPage();
    await screen.findByText('Acme Store');

    listSellers.mockResolvedValue(
      pageOf([seller({ status: 'PENDING_REVIEW' })]),
    );
    await userEvent.selectOptions(
      screen.getByLabelText(/status/i),
      'PENDING_REVIEW',
    );

    await waitFor(() =>
      expect(listSellers).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'PENDING_REVIEW', page: 1 }),
      ),
    );
  });

  it('refetches when the page changes via pagination', async () => {
    listSellers.mockResolvedValue(
      pageOf([seller()], { total: 40, totalPages: 2 }),
    );
    renderPage();
    await screen.findByText('Acme Store');

    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }));

    await waitFor(() =>
      expect(listSellers).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );
  });

  it('shows empty state when there are no sellers', async () => {
    listSellers.mockResolvedValue(pageOf([]));
    renderPage();
    expect(await screen.findByText(/no sellers found/i)).toBeInTheDocument();
  });

  it('shows error state and a Try-again button that refetches', async () => {
    listSellers.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByRole('alert')).toBeInTheDocument();

    listSellers.mockResolvedValue(pageOf([seller()]));
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('Acme Store')).toBeInTheDocument();
  });

  it('links each row displayName to /sellers/:id', async () => {
    listSellers.mockResolvedValue(pageOf([seller({ id: 'abc123' })]));
    renderPage();

    const link = await screen.findByRole('link', { name: 'Acme Store' });
    expect(link).toHaveAttribute('href', '/sellers/abc123');
  });
});
