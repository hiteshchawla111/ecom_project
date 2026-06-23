import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { InventoryReport } from '../lib/inventory';

const getInventoryReport = vi.fn();
vi.mock('../lib/inventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/inventory')>();
  return {
    ...actual,
    getInventoryReport: () => getInventoryReport(),
  };
});

import { InventoryReportPage } from './InventoryReportPage';

const report: InventoryReport = {
  totalProducts: 16,
  totalAvailable: 59,
  totalReserved: 1,
  lowStockCount: 13,
  outOfStockCount: 12,
  valuation: '11824.50',
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <InventoryReportPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  getInventoryReport.mockReset();
  getInventoryReport.mockResolvedValue(report);
});

describe('InventoryReportPage', () => {
  it('fetches and renders the cross-seller report', async () => {
    renderPage();
    expect(await screen.findByText('16')).toBeInTheDocument();
    expect(screen.getByText('$11,824.50')).toBeInTheDocument();
    expect(getInventoryReport).toHaveBeenCalledTimes(1);
  });

  it('shows an error when the fetch fails', async () => {
    getInventoryReport.mockRejectedValue(new Error('nope'));
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument(),
    );
  });
});
