// src/components/seller/SellerStatusCard.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SellerStatusCard } from './SellerStatusCard';

const base = {
  id: 's1', displayName: 'My Shop', slug: 'my-shop', description: null, logoUrl: null,
  kycVerifiedAt: null, bankAccountLast4: null, gstinPresent: false, panPresent: false,
  bankIfscPresent: false, createdAt: '', updatedAt: '',
};

describe('SellerStatusCard', () => {
  it('shows the status label', () => {
    render(<SellerStatusCard seller={{ ...base, status: 'PENDING_REVIEW' }} />);
    expect(screen.getByText(/pending review/i)).toBeInTheDocument();
  });
  it('summarizes KYC presence', () => {
    render(<SellerStatusCard seller={{ ...base, status: 'ACTIVE', panPresent: true, bankAccountLast4: '6789' }} />);
    expect(screen.getByText(/PAN on file/i)).toBeInTheDocument();
    expect(screen.getByText(/6789/)).toBeInTheDocument();
  });
  it('shows Suspended label', () => {
    render(<SellerStatusCard seller={{ ...base, status: 'SUSPENDED' }} />);
    expect(screen.getByText(/suspended/i)).toBeInTheDocument();
  });
  it('shows Deactivated label', () => {
    render(<SellerStatusCard seller={{ ...base, status: 'DEACTIVATED' }} />);
    expect(screen.getByText(/deactivated/i)).toBeInTheDocument();
  });
});
