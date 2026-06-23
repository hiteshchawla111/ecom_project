import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { InventoryReport } from '../lib/inventory';

const getSellerInventoryReport = vi.fn();
vi.mock('../lib/sellerInventory', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/sellerInventory')>();
  return {
    ...actual,
    getSellerInventoryReport: () => getSellerInventoryReport(),
  };
});

import { SellerInventoryReportPage } from './SellerInventoryReportPage';

const report: InventoryReport = {
  totalProducts: 2,
  totalAvailable: 38,
  totalReserved: 0,
  lowStockCount: 1,
  outOfStockCount: 0,
  valuation: '445.50',
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <SellerInventoryReportPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  getSellerInventoryReport.mockReset();
  getSellerInventoryReport.mockResolvedValue(report);
});

describe('SellerInventoryReportPage', () => {
  it('fetches and renders the seller-scoped report', async () => {
    renderPage();
    expect(await screen.findByText('2')).toBeInTheDocument();
    expect(screen.getByText('$445.50')).toBeInTheDocument();
    expect(getSellerInventoryReport).toHaveBeenCalledTimes(1);
  });

  it('shows an error when the fetch fails', async () => {
    getSellerInventoryReport.mockRejectedValue(new Error('nope'));
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument(),
    );
  });
});
