import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RatingBreakdown } from './RatingBreakdown';

const DIST = { '1': 0, '2': 0, '3': 1, '4': 0, '5': 3 } as const;

describe('RatingBreakdown', () => {
  it('renders a row per star (5 down to 1) with its count', () => {
    render(<RatingBreakdown distribution={DIST} count={4} />);
    // Each star row shows its label and count.
    expect(screen.getByText('5 stars')).toBeInTheDocument();
    expect(screen.getByText('1 star')).toBeInTheDocument();
    expect(screen.getByTestId('breakdown-count-5')).toHaveTextContent('3');
    expect(screen.getByTestId('breakdown-count-3')).toHaveTextContent('1');
    expect(screen.getByTestId('breakdown-count-1')).toHaveTextContent('0');
  });

  it('sizes each bar proportionally to the total count', () => {
    render(<RatingBreakdown distribution={DIST} count={4} />);
    // 5-star: 3/4 = 75%.
    expect(screen.getByTestId('breakdown-bar-5')).toHaveStyle({ width: '75%' });
    // 1-star: 0/4 = 0%.
    expect(screen.getByTestId('breakdown-bar-1')).toHaveStyle({ width: '0%' });
  });

  it('renders 0% bars (no divide-by-zero) when count is 0', () => {
    render(
      <RatingBreakdown
        distribution={{ '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }}
        count={0}
      />,
    );
    expect(screen.getByTestId('breakdown-bar-5')).toHaveStyle({ width: '0%' });
  });
});
