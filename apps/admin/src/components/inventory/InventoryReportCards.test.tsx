import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InventoryReportCards } from './InventoryReportCards';
import type { InventoryReport } from '../../lib/inventory';

const report: InventoryReport = {
  totalProducts: 16,
  totalAvailable: 59,
  totalReserved: 1,
  lowStockCount: 13,
  outOfStockCount: 12,
  valuation: '11824.50',
};

describe('InventoryReportCards', () => {
  it('renders all six metrics from the report', () => {
    render(
      <InventoryReportCards report={report} loading={false} error={null} />,
    );
    expect(screen.getByText('Total products')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByText('Available units')).toBeInTheDocument();
    expect(screen.getByText('59')).toBeInTheDocument();
    expect(screen.getByText('Reserved units')).toBeInTheDocument();
    expect(screen.getByText('Low stock')).toBeInTheDocument();
    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByText('Out of stock')).toBeInTheDocument();
  });

  it('formats valuation as currency from the API money string', () => {
    render(
      <InventoryReportCards report={report} loading={false} error={null} />,
    );
    expect(screen.getByText('Inventory valuation')).toBeInTheDocument();
    expect(screen.getByText('$11,824.50')).toBeInTheDocument();
  });

  it('shows a loading status while fetching', () => {
    render(<InventoryReportCards report={null} loading error={null} />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
  });

  it('shows an error alert and no cards when the fetch fails', () => {
    render(
      <InventoryReportCards report={null} loading={false} error="Boom" />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
    expect(screen.queryByText('Total products')).not.toBeInTheDocument();
  });
});
