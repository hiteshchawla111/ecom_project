import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Hero } from '@/components/home/Hero';

// The home page (`./page`) is an async Server Component that calls server-only
// data fns, which Vitest cannot render directly. Its presentational pieces —
// Hero and CategoryShortcuts — are unit-tested in their own files. This file
// keeps a lightweight smoke over the hero that anchors the home route.
describe('Home page', () => {
  it('renders the hero heading and primary CTA', () => {
    render(<Hero />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /shop products/i }),
    ).toHaveAttribute('href', '/products');
  });
});
