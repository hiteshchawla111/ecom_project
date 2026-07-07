import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviewStatusBadge } from './ReviewStatusBadge';

describe('ReviewStatusBadge', () => {
  it('shows Visible when not hidden', () => {
    render(<ReviewStatusBadge isHidden={false} />);
    expect(screen.getByText('Visible')).toBeInTheDocument();
  });

  it('shows Hidden when hidden', () => {
    render(<ReviewStatusBadge isHidden />);
    expect(screen.getByText('Hidden')).toBeInTheDocument();
  });
});
