import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Price } from './Price';

describe('Price', () => {
  it('renders a single price when not on sale', () => {
    render(<Price price="799" salePrice={null} />);
    expect(screen.getByText('$799.00')).toBeInTheDocument();
    expect(screen.queryByText(/sale/i)).not.toBeInTheDocument();
  });

  it('renders the sale price with the original struck through when on sale', () => {
    render(<Price price="799" salePrice="699" />);
    // Sale price is the prominent value.
    expect(screen.getByText('$699.00')).toBeInTheDocument();
    // Original is shown for reference, marked as a deletion for a11y.
    const original = screen.getByText('$799.00');
    expect(original.tagName.toLowerCase()).toBe('del');
    // Not color-only: a textual "Sale" cue is present for screen readers.
    expect(screen.getByText(/sale/i)).toBeInTheDocument();
  });

  it('treats a sale price equal to the regular price as not on sale', () => {
    render(<Price price="799" salePrice="799" />);
    expect(screen.queryByText(/sale/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('deletion')).not.toBeInTheDocument();
  });
});
