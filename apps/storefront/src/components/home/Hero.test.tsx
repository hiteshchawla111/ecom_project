import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Hero } from './Hero';

describe('Hero', () => {
  it('renders a top-level heading', () => {
    render(<Hero />);
    expect(
      screen.getByRole('heading', { level: 1 }),
    ).toBeInTheDocument();
  });

  it('links the primary CTA to products and the secondary to categories', () => {
    render(<Hero />);
    expect(screen.getByRole('link', { name: /shop products/i })).toHaveAttribute(
      'href',
      '/products',
    );
    expect(
      screen.getByRole('link', { name: /browse categories/i }),
    ).toHaveAttribute('href', '/categories');
  });

  it('honors custom CTA hrefs', () => {
    render(<Hero primaryCtaHref="/products?sort=price" secondaryCtaHref="/categories/electronics" />);
    expect(screen.getByRole('link', { name: /shop products/i })).toHaveAttribute(
      'href',
      '/products?sort=price',
    );
    expect(
      screen.getByRole('link', { name: /browse categories/i }),
    ).toHaveAttribute('href', '/categories/electronics');
  });
});
