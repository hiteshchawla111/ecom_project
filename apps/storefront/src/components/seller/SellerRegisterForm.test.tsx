// src/components/seller/SellerRegisterForm.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

import { SellerRegisterForm } from './SellerRegisterForm';

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
  vi.restoreAllMocks();
});

describe('SellerRegisterForm', () => {
  it('blocks submit when display name is empty', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    render(<SellerRegisterForm />);
    fireEvent.submit(screen.getByRole('button', { name: /submit application/i }).closest('form')!);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('submits and redirects to /account/seller on success', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);
    render(<SellerRegisterForm />);
    fireEvent.change(screen.getByLabelText(/shop display name/i), { target: { value: 'My Shop' } });
    fireEvent.submit(screen.getByRole('button', { name: /submit application/i }).closest('form')!);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/account/seller'));
    expect(refresh).toHaveBeenCalled();
  });

  it('surfaces a server error message', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'You already have a seller account' }),
    } as Response);
    render(<SellerRegisterForm />);
    fireEvent.change(screen.getByLabelText(/shop display name/i), { target: { value: 'My Shop' } });
    fireEvent.submit(screen.getByRole('button', { name: /submit application/i }).closest('form')!);
    await waitFor(() =>
      expect(screen.getByText(/already have a seller account/i)).toBeInTheDocument(),
    );
  });

  it('redirects to /login?next=/account/seller when response body has reauth:true', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, reauth: true }),
    } as Response);
    render(<SellerRegisterForm />);
    fireEvent.change(screen.getByLabelText(/shop display name/i), { target: { value: 'My Shop' } });
    fireEvent.submit(screen.getByRole('button', { name: /submit application/i }).closest('form')!);
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/login?next=/account/seller'),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
