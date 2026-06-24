import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SellerLink } from './SellerLink';

describe('SellerLink', () => {
  it('renders a "Sold by" link to the seller storefront', () => {
    render(<SellerLink seller={{ displayName: 'Demo Shop', slug: 'demo-shop' }} />);

    expect(screen.getByText(/sold by/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /view products sold by demo shop/i });
    expect(link).toHaveAttribute('href', '/seller/demo-shop');
    expect(link).toHaveTextContent('Demo Shop');
  });

  it('renders nothing when seller is undefined', () => {
    const { container } = render(<SellerLink seller={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the slug is missing', () => {
    const { container } = render(
      // @ts-expect-error — intentionally malformed input to prove the guard
      <SellerLink seller={{ displayName: 'No Slug' }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the displayName is missing', () => {
    const { container } = render(
      // @ts-expect-error — intentionally malformed input to prove the guard
      <SellerLink seller={{ slug: 'no-name' }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
