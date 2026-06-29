import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { SellerView, SellerStatus } from '../lib/sellers';
import { ApiError } from '../lib/types';

const getSeller = vi.fn();
const updateSellerStatus = vi.fn();
vi.mock('../lib/sellers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/sellers')>();
  return {
    ...actual,
    getSeller: (...a: unknown[]) => getSeller(...a),
    updateSellerStatus: (...a: unknown[]) => updateSellerStatus(...a),
  };
});

import { SellerDetailPage } from './SellerDetailPage';
import { ConfirmProvider } from '../components/ui/confirm';

const sellerFixture = (over: Partial<SellerView> = {}): SellerView => ({
  id: 's1',
  displayName: 'Acme Store',
  slug: 'acme-store',
  description: 'A great store',
  logoUrl: null,
  status: 'PENDING_REVIEW' as SellerStatus,
  kycVerifiedAt: null,
  bankAccountLast4: '••••1234',
  gstinPresent: true,
  panPresent: false,
  bankIfscPresent: true,
  createdAt: '2026-06-18T12:00:00.000Z',
  updatedAt: '2026-06-18T12:00:00.000Z',
  ...over,
});

const renderAt = (id = 's1') =>
  render(
    <ConfirmProvider>
      <MemoryRouter initialEntries={[`/sellers/${id}`]}>
        <Routes>
          <Route path="/sellers/:id" element={<SellerDetailPage />} />
          <Route path="/sellers" element={<div>sellers list</div>} />
        </Routes>
      </MemoryRouter>
    </ConfirmProvider>,
  );

beforeEach(() => {
  getSeller.mockReset();
  updateSellerStatus.mockReset();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'prompt').mockReturnValue(null);
});

describe('SellerDetailPage', () => {
  it('renders the seller displayName and status badge after load', async () => {
    getSeller.mockResolvedValue(sellerFixture());
    renderAt();

    expect(await screen.findByText('Acme Store')).toBeInTheDocument();
    expect(screen.getByText('Pending review')).toBeInTheDocument();
  });

  it('KYC panel shows masked last-4 and presence flags, and does NOT render raw KYC values', async () => {
    // Pass a realistic GSTIN-like raw value in description to prove it's not leaking
    const rawGstin = '27AAACR5055K1ZV';
    getSeller.mockResolvedValue(
      sellerFixture({
        description: 'Normal description',
        bankAccountLast4: '••••5678',
        gstinPresent: true,
        panPresent: true,
        bankIfscPresent: false,
      }),
    );
    renderAt();
    await screen.findByText('Acme Store');

    // Masked last-4 is shown
    expect(screen.getByText('••••5678')).toBeInTheDocument();

    // Presence flags shown as text
    const gstinDt = screen.getByText('GSTIN');
    expect(gstinDt.nextElementSibling?.textContent).toBe('Provided');

    const panDt = screen.getByText('PAN');
    expect(panDt.nextElementSibling?.textContent).toBe('Provided');

    const ifscDt = screen.getByText('Bank IFSC');
    expect(ifscDt.nextElementSibling?.textContent).toBe('Not provided');

    // The raw GSTIN value is NOT present anywhere in the document
    expect(screen.queryByText(rawGstin)).not.toBeInTheDocument();
  });

  it('PENDING_REVIEW seller shows Approve and Suspend/Reject buttons', async () => {
    getSeller.mockResolvedValue(sellerFixture({ status: 'PENDING_REVIEW' }));
    renderAt();
    await screen.findByText('Acme Store');

    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /suspend \/ reject/i }),
    ).toBeInTheDocument();
    // DEACTIVATED is not a valid next status from PENDING_REVIEW
    expect(
      screen.queryByRole('button', { name: /deactivate/i }),
    ).not.toBeInTheDocument();
  });

  it('clicking Approve calls updateSellerStatus with ACTIVE and no reason, then reflects the returned seller', async () => {
    getSeller.mockResolvedValue(sellerFixture({ status: 'PENDING_REVIEW' }));
    updateSellerStatus.mockResolvedValue(
      sellerFixture({ status: 'ACTIVE' }),
    );
    const promptSpy = vi.spyOn(window, 'prompt');
    renderAt();
    await screen.findByText('Acme Store');

    await userEvent.click(screen.getByRole('button', { name: /approve/i }));
    // Confirm in the AlertDialog (replaces the old window.confirm).
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^confirm$/i }));

    await waitFor(() =>
      expect(updateSellerStatus).toHaveBeenCalledWith('s1', 'ACTIVE', undefined),
    );
    expect(await screen.findByText('Active')).toBeInTheDocument();
    // No reason prompt for Approve.
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it('clicking Suspend/Reject prompts for a reason and calls updateSellerStatus with the reason', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('bad docs');
    getSeller.mockResolvedValue(sellerFixture({ status: 'PENDING_REVIEW' }));
    updateSellerStatus.mockResolvedValue(
      sellerFixture({ status: 'SUSPENDED' }),
    );
    renderAt();
    await screen.findByText('Acme Store');

    await userEvent.click(
      screen.getByRole('button', { name: /suspend \/ reject/i }),
    );
    // Confirm the destructive action in the dialog; the reason prompt follows.
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^confirm$/i }));

    await waitFor(() =>
      expect(updateSellerStatus).toHaveBeenCalledWith('s1', 'SUSPENDED', 'bad docs'),
    );
    expect(await screen.findByText('Suspended')).toBeInTheDocument();
  });

  it('cancelling the confirm dialog does NOT call updateSellerStatus', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    getSeller.mockResolvedValue(sellerFixture({ status: 'PENDING_REVIEW' }));
    renderAt();
    await screen.findByText('Acme Store');

    await userEvent.click(screen.getByRole('button', { name: /approve/i }));

    expect(updateSellerStatus).not.toHaveBeenCalled();
  });

  it('shows a not-found message when the seller is missing', async () => {
    getSeller.mockRejectedValue(new ApiError(404, 'not found'));
    renderAt('missing');
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });

  it('shows no action buttons for a DEACTIVATED seller', async () => {
    getSeller.mockResolvedValue(sellerFixture({ status: 'DEACTIVATED' }));
    renderAt();
    await screen.findByText('Acme Store');

    expect(
      screen.queryByRole('button', { name: /approve|suspend|deactivate/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/no actions available/i)).toBeInTheDocument();
  });
});
