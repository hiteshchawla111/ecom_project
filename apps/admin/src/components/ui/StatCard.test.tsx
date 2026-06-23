import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders the label and value', () => {
    render(<StatCard label="Total products" value="42" />);
    expect(screen.getByText('Total products')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders an optional hint', () => {
    render(<StatCard label="Revenue" value="—" hint="Coming soon" />);
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });

  it('omits the hint when not provided', () => {
    render(<StatCard label="Total products" value="42" />);
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
  });

  it('renders an optional decorative icon', () => {
    render(
      <StatCard
        label="Total products"
        value="42"
        icon={<svg data-testid="card-icon" />}
      />,
    );
    expect(screen.getByTestId('card-icon')).toBeInTheDocument();
  });

  it('renders a trend with its label and an accessible direction', () => {
    render(
      <StatCard
        label="Orders"
        value="312"
        trend={{ direction: 'up', label: '6% vs last month' }}
      />,
    );
    const trend = screen.getByText(/6% vs last month/i);
    expect(trend).toBeInTheDocument();
    // Direction conveyed by text/aria, not color alone (DESIGN.md a11y rule).
    expect(screen.getByText(/increase/i)).toBeInTheDocument();
  });

  it('omits the trend footnote when not provided', () => {
    render(<StatCard label="Total products" value="42" />);
    expect(screen.queryByText(/vs last month/i)).not.toBeInTheDocument();
  });
});
