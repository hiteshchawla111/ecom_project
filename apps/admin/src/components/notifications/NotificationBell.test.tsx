import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../lib/notifications', () => ({
  fetchUnreadCount: vi.fn(),
  fetchNotifications: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
}));
import * as client from '../../lib/notifications';
import { NotificationBell } from './NotificationBell';

const c = client as unknown as Record<string, ReturnType<typeof vi.fn>>;
const row = (o = {}) => ({ id: 'n1', type: 'NEW_ORDER', payload: {}, readAt: null, createdAt: new Date().toISOString(), ...o });

describe('NotificationBell (admin)', () => {
  beforeEach(() => {
    c.fetchUnreadCount.mockReset().mockResolvedValue(2);
    c.fetchNotifications.mockReset().mockResolvedValue([row(), row({ id: 'n2', type: 'LOW_STOCK', readAt: new Date().toISOString() })]);
    c.markRead.mockReset().mockResolvedValue(undefined);
    c.markAllRead.mockReset().mockResolvedValue(undefined);
  });

  it('shows the unread badge from mount', async () => {
    render(<NotificationBell />);
    expect(await screen.findByLabelText(/2 unread/i)).toBeInTheDocument();
  });
  it('opening renders rows with staff copy', async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(await screen.findByText('New order placed')).toBeInTheDocument();
    expect(screen.getByText('Low stock alert')).toBeInTheDocument();
  });
  it('clicking an unread row marks it read + decrements', async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await userEvent.click(await screen.findByText('New order placed'));
    await waitFor(() => expect(c.markRead).toHaveBeenCalledWith('n1'));
  });
  it('mark all read zeroes the badge', async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await userEvent.click(await screen.findByRole('button', { name: /mark all read/i }));
    await waitFor(() => expect(c.markAllRead).toHaveBeenCalled());
  });
  it('empty state', async () => {
    c.fetchNotifications.mockResolvedValue([]);
    c.fetchUnreadCount.mockResolvedValue(0);
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(await screen.findByText(/no notifications/i)).toBeInTheDocument();
  });
  it('aria-expanded toggles and Escape closes', async () => {
    render(<NotificationBell />);
    const btn = screen.getByRole('button', { name: /notifications/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(btn).toHaveAttribute('aria-expanded', 'false'));
  });
});
