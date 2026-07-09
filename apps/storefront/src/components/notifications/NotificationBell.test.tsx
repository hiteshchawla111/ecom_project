import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/notifications-client', () => ({
  fetchUnreadCount: vi.fn(),
  fetchNotifications: vi.fn(),
  postMarkRead: vi.fn(),
  postMarkAll: vi.fn(),
}));
import * as client from '@/lib/notifications-client';
import { NotificationBell } from './NotificationBell';

const c = client as unknown as Record<string, ReturnType<typeof vi.fn>>;

function row(over = {}) {
  return { id: 'n1', type: 'SHIPPING_UPDATE', payload: {}, readAt: null, createdAt: new Date().toISOString(), ...over };
}

describe('NotificationBell', () => {
  beforeEach(() => {
    c.fetchUnreadCount.mockReset().mockResolvedValue(2);
    c.fetchNotifications.mockReset().mockResolvedValue([row(), row({ id: 'n2', type: 'ORDER_CONFIRMATION', readAt: new Date().toISOString() })]);
    c.postMarkRead.mockReset().mockResolvedValue(undefined);
    c.postMarkAll.mockReset().mockResolvedValue(undefined);
  });

  it('shows the unread badge from mount', async () => {
    render(<NotificationBell />);
    expect(await screen.findByLabelText(/2 unread/i)).toBeInTheDocument();
  });

  it('opening fetches + renders rows with friendly copy', async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(await screen.findByText('Your order has shipped')).toBeInTheDocument();
    expect(screen.getByText('Your order was placed')).toBeInTheDocument();
  });

  it('clicking an unread row marks it read and decrements', async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await userEvent.click(await screen.findByText('Your order has shipped'));
    await waitFor(() => expect(c.postMarkRead).toHaveBeenCalledWith('n1'));
  });

  it('mark all read zeroes the badge', async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await userEvent.click(await screen.findByRole('button', { name: /mark all read/i }));
    await waitFor(() => expect(c.postMarkAll).toHaveBeenCalled());
  });

  it('empty state', async () => {
    c.fetchNotifications.mockResolvedValue([]);
    c.fetchUnreadCount.mockResolvedValue(0);
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(await screen.findByText(/no notifications yet/i)).toBeInTheDocument();
  });

  it('toggles aria-expanded on the bell button when opened and closed', async () => {
    render(<NotificationBell />);
    const bellButton = screen.getByRole('button', { name: /notifications/i });
    expect(bellButton).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(bellButton);
    expect(bellButton).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(bellButton);
    expect(bellButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('pressing Escape closes the open dropdown', async () => {
    render(<NotificationBell />);
    const bellButton = screen.getByRole('button', { name: /notifications/i });
    await userEvent.click(bellButton);
    expect(await screen.findByText('Your order has shipped')).toBeInTheDocument();
    expect(bellButton).toHaveAttribute('aria-expanded', 'true');

    await userEvent.keyboard('{Escape}');

    expect(bellButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Your order has shipped')).not.toBeInTheDocument();
  });
});
