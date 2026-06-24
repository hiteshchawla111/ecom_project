import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RatingStars } from './RatingStars';

describe('RatingStars', () => {
  it('renders the average, count, and an accessible label when there are reviews', () => {
    render(<RatingStars ratingAvg="4.50" ratingCount={12} />);

    // numeric average and count are shown
    expect(screen.getByText('4.50')).toBeInTheDocument();
    expect(screen.getByText('(12)')).toBeInTheDocument();
    // accessible label on the group
    expect(
      screen.getByLabelText('Rated 4.50 out of 5 from 12 reviews'),
    ).toBeInTheDocument();
  });

  it('renders nothing when ratingCount is 0', () => {
    const { container } = render(<RatingStars ratingAvg={null} ratingCount={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when ratingAvg is null even if a count is present', () => {
    const { container } = render(<RatingStars ratingAvg={null} ratingCount={5} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('fills the rounded number of stars (4.40 → 4 filled)', () => {
    const { container } = render(<RatingStars ratingAvg="4.40" ratingCount={8} />);
    // filled stars carry text-accent-400; empties carry text-content-subtle
    expect(container.querySelectorAll('.text-accent-400')).toHaveLength(4);
    expect(container.querySelectorAll('.text-content-subtle')).toHaveLength(1);
  });
});
