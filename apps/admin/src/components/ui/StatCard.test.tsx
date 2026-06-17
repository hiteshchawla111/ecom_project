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
});
