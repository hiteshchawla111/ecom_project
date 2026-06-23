import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from './ThemeToggle';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});
afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeToggle', () => {
  it('offers to switch to dark while in light mode', () => {
    render(<ThemeToggle />);
    expect(
      screen.getByRole('button', { name: /switch to dark/i }),
    ).toBeInTheDocument();
  });

  it('switches the theme and updates its own label', async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button', { name: /switch to dark/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(
      screen.getByRole('button', { name: /switch to light/i }),
    ).toBeInTheDocument();
  });
});
