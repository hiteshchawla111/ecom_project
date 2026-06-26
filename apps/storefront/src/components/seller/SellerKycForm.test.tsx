// src/components/seller/SellerKycForm.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

import { SellerKycForm } from './SellerKycForm';

const seller = {
  id: 's1', displayName: 'My Shop', slug: 'my-shop', description: null, logoUrl: null,
  status: 'PENDING_REVIEW' as const, kycVerifiedAt: null, bankAccountLast4: null,
  gstinPresent: false, panPresent: false, bankIfscPresent: false, createdAt: '', updatedAt: '',
};

beforeEach(() => { refresh.mockClear(); vi.restoreAllMocks(); });

describe('SellerKycForm', () => {
  it('blocks an invalid PAN client-side', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    render(<SellerKycForm seller={seller} />);
    fireEvent.change(screen.getByLabelText(/PAN/i), { target: { value: 'bad' } });
    fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('PATCHes only non-empty fields and refreshes on success', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({}),
    } as Response);
    render(<SellerKycForm seller={seller} />);
    fireEvent.change(screen.getByLabelText(/PAN/i), { target: { value: 'ABCDE1234F' } });
    fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ pan: 'ABCDE1234F' });
  });
});
