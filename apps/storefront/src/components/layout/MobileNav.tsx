'use client';

import { useId, useState } from 'react';
import Link from 'next/link';

export interface MobileNavLink {
  href: string;
  label: string;
}

export interface MobileNavProps {
  links: readonly MobileNavLink[];
  isAuthenticated: boolean;
}

const itemClass =
  'block rounded-md px-3 py-2 text-sm font-medium text-content transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700';

/**
 * Mobile disclosure menu (hidden on `md+`). Menu contents only mount while open,
 * so the desktop nav remains the single source of nav/auth links in the DOM
 * when closed.
 */
export function MobileNav({ links, isAuthenticated }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md p-2 text-content-muted transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="h-5 w-5"
        >
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path d="M3 6h18M3 12h18M3 18h18" />
          )}
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute right-0 mt-2 w-56 rounded-lg border border-line bg-surface p-2 shadow-lg"
        >
          <nav aria-label="Mobile" className="flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={itemClass}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="my-1 border-t border-line" />
            {isAuthenticated ? (
              <Link
                href="/account"
                className={itemClass}
                onClick={() => setOpen(false)}
              >
                My account
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className={itemClass}
                  onClick={() => setOpen(false)}
                >
                  Log in
                </Link>
                <Link
                  href="/register"
                  className={itemClass}
                  onClick={() => setOpen(false)}
                >
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
