import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { SearchAutocomplete } from './SearchAutocomplete';

const rows = [
  { id: 'p1', name: 'Aurora Smartphone X', price: '799.00', salePrice: null },
  { id: 'p2', name: 'Aurora Lite', price: '399.00', salePrice: '349.00' },
];

const mockFetchOnce = (body: unknown) => {
  (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(body),
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  push.mockClear();
  global.fetch = vi.fn() as unknown as typeof fetch;
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

const type = (value: string) => {
  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value } });
};

describe('SearchAutocomplete', () => {
  it('does not fetch for queries shorter than 2 chars', async () => {
    render(<SearchAutocomplete />);
    type('a');
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('debounces then fetches suggestions and renders them', async () => {
    mockFetchOnce(rows);
    render(<SearchAutocomplete />);
    type('aur');
    expect(global.fetch).not.toHaveBeenCalled(); // not yet (debounce pending)
    await act(async () => { vi.advanceTimersByTime(250); });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const url = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/api/products/suggest?q=aur');
    expect(await screen.findByText('Aurora Smartphone X')).toBeInTheDocument();
  });

  it('navigates to a product when a suggestion is chosen via keyboard', async () => {
    mockFetchOnce(rows);
    render(<SearchAutocomplete />);
    type('aur');
    await act(async () => { vi.advanceTimersByTime(250); });
    await screen.findByText('Aurora Smartphone X');
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // highlight first
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/products/p1');
  });

  it('submits the raw term to /products?search= when no suggestion is highlighted', async () => {
    render(<SearchAutocomplete />);
    type('red shoes');
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/products?search=red%20shoes');
  });

  it('closes the dropdown on Escape', async () => {
    mockFetchOnce(rows);
    render(<SearchAutocomplete />);
    type('aur');
    await act(async () => { vi.advanceTimersByTime(250); });
    await screen.findByText('Aurora Smartphone X');
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(screen.queryByText('Aurora Smartphone X')).not.toBeInTheDocument();
  });

  it('shows no dropdown when the request fails', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('net'));
    render(<SearchAutocomplete />);
    type('aur');
    await act(async () => { vi.advanceTimersByTime(250); });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
