import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SiteFooter } from './SiteFooter';

describe('SiteFooter', () => {
  it('renders a contentinfo landmark', () => {
    render(<SiteFooter />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('links to products and categories', () => {
    render(<SiteFooter />);
    expect(screen.getByRole('link', { name: /products/i })).toHaveAttribute(
      'href',
      '/products',
    );
    expect(screen.getByRole('link', { name: /categories/i })).toHaveAttribute(
      'href',
      '/categories',
    );
  });
});
