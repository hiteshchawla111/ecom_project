import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Drive the active-state logic by controlling the current pathname.
const pathname = vi.hoisted(() => ({ value: '/' }));
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
}));

import { NavLinks } from './NavLinks';

const LINKS = [
  { href: '/products', label: 'Products' },
  { href: '/categories', label: 'Categories' },
] as const;

describe('NavLinks active state', () => {
  it('marks the link for the current section as the active page', () => {
    pathname.value = '/products';
    render(<NavLinks links={LINKS} />);

    const active = screen.getByRole('link', { name: /^products$/i });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active.dataset.active).toBe('true');

    const inactive = screen.getByRole('link', { name: /^categories$/i });
    expect(inactive).not.toHaveAttribute('aria-current');
    expect(inactive.dataset.active).toBe('false');
  });

  it('treats a nested route as active for its section root', () => {
    pathname.value = '/products/some-product-id';
    render(<NavLinks links={LINKS} />);

    expect(screen.getByRole('link', { name: /^products$/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('marks no link active on an unrelated route', () => {
    pathname.value = '/cart';
    render(<NavLinks links={LINKS} />);

    expect(
      screen.queryByRole('link', { name: /^products$/i }),
    ).not.toHaveAttribute('aria-current');
    expect(
      screen.queryByRole('link', { name: /^categories$/i }),
    ).not.toHaveAttribute('aria-current');
  });
});
