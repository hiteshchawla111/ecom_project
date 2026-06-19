import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderStatusBadge } from './OrderStatusBadge';

describe('OrderStatusBadge', () => {
  it('renders a human label for the status (not color-only)', () => {
    render(<OrderStatusBadge status="PENDING" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('maps Delivered to the success token', () => {
    const { container } = render(<OrderStatusBadge status="DELIVERED" />);
    expect(screen.getByText('Delivered')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('text-success-500');
  });

  it('maps Cancelled to the error token', () => {
    const { container } = render(<OrderStatusBadge status="CANCELLED" />);
    expect(container.firstChild).toHaveClass('text-error-500');
  });

  it('falls back gracefully for an unknown status', () => {
    render(<OrderStatusBadge status="WAT" />);
    expect(screen.getByText('WAT')).toBeInTheDocument();
  });
});
