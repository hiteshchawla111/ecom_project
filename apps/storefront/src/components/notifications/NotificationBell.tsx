'use client';

import { useEffect, useRef, useState } from 'react';
import {
  fetchUnreadCount,
  fetchNotifications,
  postMarkRead,
  postMarkAll,
  type NotificationView,
} from '@/lib/notifications-client';
import { notificationText, relativeTime } from '@/lib/notification-messages';

/**
 * Header notification bell: unread-count badge + dropdown feed. Same-origin
 * data only (via lib/notifications-client, no server-only imports) so this
 * stays a plain client island. Click-outside/Escape handling mirrors
 * SearchAutocomplete.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchUnreadCount().then(setUnread);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchNotifications().then((data) => {
      if (cancelled) return;
      setItems(data);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Close on click outside.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Close on Escape.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  async function handleRowClick(item: NotificationView) {
    if (item.readAt !== null) return;
    await postMarkRead(item.id);
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnread((u) => Math.max(0, u - 1));
  }

  async function handleMarkAll() {
    await postMarkAll();
    setItems((prev) => prev.map((n) => (n.readAt === null ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnread(0);
  }

  const badgeLabel = unread > 9 ? '9+' : String(unread);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex items-center justify-center rounded-md p-2 text-content hover:bg-surface-muted"
      >
        <BellIcon />
        {unread > 0 && (
          <span
            data-testid="notification-count"
            aria-label={`${unread} unread notifications`}
            className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary-500 px-1.5 text-xs font-semibold text-surface"
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div
          role="region"
          aria-label="Notifications panel"
          className="absolute right-0 z-20 mt-1 w-80 overflow-hidden rounded-md border border-line bg-surface shadow-md"
        >
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-sm font-semibold text-content">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="text-xs font-medium uppercase tracking-wide text-primary-600 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {loaded && items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-content-subtle">No notifications yet</p>
          )}

          {items.length > 0 && (
            <ul role="list" aria-label="Notifications" className="max-h-80 overflow-y-auto">
              {items.map((item) => {
                const isUnread = item.readAt === null;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleRowClick(item)}
                      className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm ${
                        isUnread ? 'bg-primary-500/10 text-content' : 'text-content-subtle'
                      } hover:bg-surface-muted`}
                    >
                      {isUnread ? (
                        <span
                          aria-hidden="true"
                          className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-primary-500"
                        />
                      ) : (
                        <span aria-hidden="true" className="mt-1.5 inline-block h-2 w-2 shrink-0" />
                      )}
                      <span className="flex-1">
                        <span className="block">{notificationText(item.type, item.payload)}</span>
                        <span className="block text-xs text-content-subtle">{relativeTime(item.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="h-5 w-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
      />
    </svg>
  );
}
