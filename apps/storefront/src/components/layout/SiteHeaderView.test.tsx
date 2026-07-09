import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { CurrentUser } from '@/lib/api-auth';
import { SiteHeaderView } from './SiteHeaderView';

// The bell fetches on mount (via lib/notifications-client); stub it so this
// header test stays a pure render test with no network calls.
vi.mock('@/components/notifications/NotificationBell', () => ({
  NotificationBell: () => <div data-testid="notification-bell-stub" />,
}));

const user: CurrentUser = {
  sub: 'u1',
  email: 'shopper@example.com',
  role: 'CUSTOMER',
};

describe('SiteHeaderView', () => {
  it('renders the brand link to the home page', () => {
    render(<SiteHeaderView user={null} />);
    const brand = screen.getByRole('link', { name: /home/i });
    expect(brand).toHaveAttribute('href', '/');
  });

  it('renders primary navigation to products and categories', () => {
    render(<SiteHeaderView user={null} />);
    expect(screen.getByRole('link', { name: /^products$/i })).toHaveAttribute(
      'href',
      '/products',
    );
    expect(screen.getByRole('link', { name: /^categories$/i })).toHaveAttribute(
      'href',
      '/categories',
    );
  });

  it('renders the "Sell with us" nav link pointing to /sell', () => {
    render(<SiteHeaderView user={null} />);
    expect(
      screen.getByRole('link', { name: /^sell with us$/i }),
    ).toHaveAttribute('href', '/sell');
  });

  it('renders a cart link', () => {
    render(<SiteHeaderView user={null} />);
    expect(screen.getByRole('link', { name: /cart/i })).toHaveAttribute(
      'href',
      '/cart',
    );
  });

  it('shows log in and sign up when logged out, not the account link', () => {
    render(<SiteHeaderView user={null} />);
    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByRole('link', { name: /sign up/i })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(
      screen.queryByRole('link', { name: /my account/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the account link when logged in, not log in / sign up', () => {
    render(<SiteHeaderView user={user} />);
    expect(screen.getByRole('link', { name: /my account/i })).toHaveAttribute(
      'href',
      '/account',
    );
    expect(
      screen.queryByRole('link', { name: /log in/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /sign up/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the notification bell for a signed-in user, not when logged out', () => {
    const loggedIn = render(<SiteHeaderView user={user} />);
    expect(
      loggedIn.getByTestId('notification-bell-stub'),
    ).toBeInTheDocument();
    loggedIn.unmount();

    const loggedOut = render(<SiteHeaderView user={null} />);
    expect(
      loggedOut.queryByTestId('notification-bell-stub'),
    ).not.toBeInTheDocument();
  });

  it('renders the product search box', () => {
    render(<SiteHeaderView user={null} />);
    expect(screen.getByRole('combobox', { name: /search products/i })).toBeInTheDocument();
  });
});
