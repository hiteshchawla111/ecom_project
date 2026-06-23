import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

beforeEach(() => {
  document.documentElement.setAttribute('data-theme', 'light');
  document.cookie = 'sf_theme=; max-age=0; path=/';
});
afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.cookie = 'sf_theme=; max-age=0; path=/';
});

describe('ThemeToggle (storefront)', () => {
  it('labels itself by the action it performs (light → offers dark)', () => {
    render(<ThemeToggle />);
    expect(
      screen.getByRole('button', { name: /switch to dark/i }),
    ).toBeInTheDocument();
  });

  it('flips the document attribute and writes the cookie on click', async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button', { name: /switch to dark/i }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.cookie).toContain('sf_theme=dark');
    expect(
      screen.getByRole('button', { name: /switch to light/i }),
    ).toBeInTheDocument();
  });

  it('reads the initial state from the document attribute', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<ThemeToggle />);
    expect(
      screen.getByRole('button', { name: /switch to light/i }),
    ).toBeInTheDocument();
  });
});
