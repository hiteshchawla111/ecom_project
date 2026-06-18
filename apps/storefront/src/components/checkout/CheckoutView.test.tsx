import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { CartProvider } from '@/components/cart/CartProvider';
import { CheckoutView } from './CheckoutView';
import type { CartView } from '@/lib/api-cart';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const cart: CartView = {
  id: 'c1',
  items: [{ productId: 'p1', name: 'Mouse', unitPrice: '19.99', quantity: 2, lineTotal: '39.98', image: null }],
  totals: { subtotal: '39.98', discountTotal: '0.00', taxTotal: '4.00', shippingTotal: '5.00', grandTotal: '48.98' },
};

const fill = () => {
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Ada' } });
  fireEvent.change(screen.getByLabelText(/address line 1/i), { target: { value: '12 Way' } });
  fireEvent.change(screen.getByLabelText(/city/i), { target: { value: 'London' } });
  fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'GL' } });
  fireEvent.change(screen.getByLabelText(/country/i), { target: { value: 'UK' } });
  fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: 'EC1A' } });
};

const renderView = () =>
  render(<CartProvider initialCart={cart}><CheckoutView cart={cart} /></CartProvider>);

beforeEach(() => {
  pushMock.mockReset();
  global.fetch = vi.fn();
});

describe('CheckoutView', () => {
  it('renders the order review with the grand total from the cart envelope', () => {
    renderView();
    expect(screen.getByText('Mouse')).toBeInTheDocument();
    expect(screen.getByText('$48.98')).toBeInTheDocument();
  });

  it('does not submit when required fields are empty', async () => {
    renderView();
    await act(async () => { screen.getByRole('button', { name: /place order/i }).click(); });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('POSTs the shipping body and redirects to the order on success', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 201, json: async () => ({ id: 'order9' }),
    });
    renderView();
    fill();
    await act(async () => { screen.getByRole('button', { name: /place order/i }).click(); });
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/orders');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ shipFullName: 'Ada', shipPostalCode: 'EC1A' });
    expect(pushMock).toHaveBeenCalledWith('/orders/order9');
  });

  it('shows an inline error when the API returns a 400', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 400, json: async () => ({ message: 'Your cart is empty' }),
    });
    renderView();
    fill();
    await act(async () => { screen.getByRole('button', { name: /place order/i }).click(); });
    expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
