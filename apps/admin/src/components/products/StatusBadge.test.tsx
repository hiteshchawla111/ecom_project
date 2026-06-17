import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('shows the status text for each status (not color-only)', () => {
    const { rerender } = render(<StatusBadge status="ACTIVE" />);
    expect(screen.getByText(/active/i)).toBeInTheDocument();

    rerender(<StatusBadge status="INACTIVE" />);
    expect(screen.getByText(/inactive/i)).toBeInTheDocument();

    rerender(<StatusBadge status="ARCHIVED" />);
    expect(screen.getByText(/archived/i)).toBeInTheDocument();
  });
});
