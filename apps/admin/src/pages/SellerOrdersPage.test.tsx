import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { SubOrderPage, SubOrderView } from '../lib/sellerSubOrders';

const fetchSubOrders = vi.fn();
const updateSubOrderStatus = vi.fn();
vi.mock('../lib/sellerSubOrders', () => ({
  fetchSubOrders: (...a: unknown[]) => fetchSubOrders(...a),
  updateSubOrderStatus: (...a: unknown[]) => updateSubOrderStatus(...a),
}));

import { SellerOrdersPage } from './SellerOrdersPage';
import { ConfirmProvider } from '../components/ui/confirm';

const sub = (over: Partial<SubOrderView> = {}): SubOrderView => ({
  id: 'sub1', orderId: 'order-abcdefgh', status: 'PENDING',
  subtotal: '100.00', discountTotal: '0.00', taxTotal: '8.00', shippingTotal: '5.00', grandTotal: '113.00',
  shipFullName: 'Ada', shipLine1: '1 St', shipLine2: null, shipCity: 'London', shipState: 'LDN', shipCountry: 'UK', shipPostalCode: 'EC1',
  items: [{ productId: 'p1', productName: 'Widget', unitPrice: '50.00', quantity: 2, lineTotal: '100.00', sellerName: 'Shop One' }],
  createdAt: '2026-07-01T12:00:00.000Z', ...over,
});
const pageOf = (data: SubOrderView[], nextCursor: string | null = null): SubOrderPage => ({ data, nextCursor });

const renderPage = () =>
  render(
    <ConfirmProvider>
      <MemoryRouter><SellerOrdersPage /></MemoryRouter>
    </ConfirmProvider>,
  );

describe('SellerOrdersPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads and renders sub-order cards', async () => {
    fetchSubOrders.mockResolvedValue(pageOf([sub()]));
    renderPage();
    expect(await screen.findByText('Ada')).toBeInTheDocument();
    expect(fetchSubOrders).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
  });

  it('shows the empty state when there are no sub-orders', async () => {
    fetchSubOrders.mockResolvedValue(pageOf([]));
    renderPage();
    expect(await screen.findByText(/no orders/i)).toBeInTheDocument();
  });

  it('appends the next page on Load more and hides the button at the end', async () => {
    fetchSubOrders
      .mockResolvedValueOnce(pageOf([sub({ id: 'sub1', shipFullName: 'Ada' })], 'cur1'))
      .mockResolvedValueOnce(pageOf([sub({ id: 'sub2', shipFullName: 'Grace' })], null));
    renderPage();
    await screen.findByText('Ada');
    await userEvent.click(screen.getByRole('button', { name: /load more/i }));
    await screen.findByText('Grace');
    expect(fetchSubOrders).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cur1' }));
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });

  it('transitions a card (confirm dialog) and updates it in place', async () => {
    fetchSubOrders.mockResolvedValue(pageOf([sub({ id: 'sub1', status: 'PENDING' })]));
    updateSubOrderStatus.mockResolvedValue(sub({ id: 'sub1', status: 'CONFIRMED' }));
    renderPage();
    await screen.findByText('Ada');
    // Card's "Confirm" action opens the confirm dialog.
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    // confirm.tsx uses shadcn/Radix AlertDialog → role="alertdialog"; its action label is "Confirm".
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^confirm$/i }));
    await waitFor(() => expect(updateSubOrderStatus).toHaveBeenCalledWith('sub1', 'CONFIRMED'));
    await waitFor(() => expect(screen.getByText('Confirmed')).toBeInTheDocument());
  });
});
