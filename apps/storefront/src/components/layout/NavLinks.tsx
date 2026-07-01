'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { prefersReducedMotion } from '@/components/motion/prefers-reduced-motion';

gsap.registerPlugin(useGSAP);

export interface NavLink {
  href: string;
  label: string;
}

export interface NavLinksProps {
  links: readonly NavLink[];
}

const linkBase =
  'group relative text-xs font-medium uppercase tracking-[0.14em] transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700';

/**
 * Returns true when `href` matches the current pathname for active-state
 * purposes: an exact match, or a section root that the current path lives
 * under (e.g. `/products` is active on `/products/abc`). The home link `/`
 * matches only the exact root so it isn't perpetually "active".
 */
function isActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Desktop primary nav (active-aware). Client component so it can read the
 * current pathname and highlight the active route (`nav-state-active`), and
 * run a reduced-motion-safe underline-wipe on hover. Purely presentational —
 * renders normal Next <Link>s with the same hrefs.
 */
export function NavLinks({ links }: NavLinksProps) {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const root = ref.current;
      if (!root || prefersReducedMotion()) return;
      if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        return;
      }
      // Underline grows L→R on hover, retracts on leave. Pure transform on the
      // ::after stand-in <span>, so it never shifts layout.
      const items = Array.from(
        root.querySelectorAll<HTMLElement>('[data-nav-item]'),
      );
      const cleanups = items.map((item) => {
        const underline = item.querySelector<HTMLElement>('[data-underline]');
        if (!underline) return () => {};
        // Active links keep their underline shown; don't animate those away.
        if (item.dataset.active === 'true') return () => {};
        gsap.set(underline, { scaleX: 0, transformOrigin: 'left center' });
        const enter = () =>
          gsap.to(underline, { scaleX: 1, duration: 0.35, ease: 'power3.out' });
        const leave = () =>
          gsap.to(underline, {
            scaleX: 0,
            duration: 0.3,
            ease: 'power3.in',
            transformOrigin: 'right center',
          });
        item.addEventListener('pointerenter', enter);
        item.addEventListener('pointerleave', leave);
        return () => {
          item.removeEventListener('pointerenter', enter);
          item.removeEventListener('pointerleave', leave);
        };
      });
      return () => cleanups.forEach((fn) => fn());
    },
    { scope: ref, dependencies: [pathname] },
  );

  return (
    <nav ref={ref} aria-label="Primary" className="hidden items-center gap-7 md:flex">
      {links.map((link) => {
        const active = isActive(link.href, pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            data-nav-item
            data-active={active}
            aria-current={active ? 'page' : undefined}
            className={`${linkBase} ${active ? 'text-content' : 'text-content-muted hover:text-content'}`}
          >
            {link.label}
            <span
              data-underline
              aria-hidden="true"
              className={`absolute -bottom-1 left-0 h-px w-full bg-primary-600 ${active ? 'scale-x-100' : 'scale-x-0'}`}
            />
          </Link>
        );
      })}
    </nav>
  );
}
