'use client';

import { useRef, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { prefersReducedMotion } from '@/components/motion/prefers-reduced-motion';

gsap.registerPlugin(useGSAP, ScrollTrigger);

export interface HeaderMotionProps {
  children: ReactNode;
}

/**
 * Motion wrapper for the site header. Runs two reduced-motion-safe effects on
 * the client (auto-cleaned via useGSAP):
 *
 *  1. Entrance — wordmark, nav, search, and actions ease in on mount, staggered.
 *     Uses fromTo + clearProps so the header is never left hidden if GSAP can't
 *     run (failure-safe, matching the Reveal pattern).
 *  2. Scroll condense — once the page scrolls past a small threshold, the bar
 *     strengthens its backdrop (border + shadow). Toggles a `data-condensed`
 *     attribute the header reads via CSS; animates nothing that reflows layout.
 *
 * Purely presentational: it wraps the existing header markup unchanged.
 */
export function HeaderMotion({ children }: HeaderMotionProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    (_context, contextSafe) => {
      const root = ref.current;
      if (!root) return;

      const reduced = prefersReducedMotion();
      const canHover =
        typeof window !== 'undefined' &&
        window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      const header = root.closest('header');

      // Scroll condense: strengthen the backdrop once scrolled. Runs in every
      // mode (the visual change is CSS, not motion) so the header looks right.
      if (header) {
        ScrollTrigger.create({
          start: 'top -8',
          end: 99999,
          onUpdate: (self) => {
            header.dataset.condensed = self.scroll() > 8 ? 'true' : 'false';
          },
        });
      }

      // Cart icon "settle": a subtle scale on hover, transform-only so it never
      // shifts the row. Skipped under reduced-motion / non-hover devices.
      let cartCleanup: (() => void) | undefined;
      const cart = root.querySelector<HTMLElement>('[data-cart-link]');
      if (cart && contextSafe && !reduced && canHover) {
        const enter = contextSafe(() =>
          gsap.to(cart, { scale: 1.12, duration: 0.25, ease: 'back.out(2)' }),
        );
        const leave = contextSafe(() =>
          gsap.to(cart, { scale: 1, duration: 0.25, ease: 'power2.out' }),
        );
        cart.addEventListener('pointerenter', enter);
        cart.addEventListener('pointerleave', leave);
        cartCleanup = () => {
          cart.removeEventListener('pointerenter', enter);
          cart.removeEventListener('pointerleave', leave);
        };
      }

      // Entrance: stagger the three zones in from above. fromTo +
      // immediateRender:false + clearProps is failure-safe — the header is never
      // left hidden if GSAP can't run.
      if (!reduced) {
        const targets =
          root.querySelectorAll<HTMLElement>('[data-header-reveal]');
        gsap.fromTo(
          targets,
          { opacity: 0, y: -12 },
          {
            opacity: 1,
            y: 0,
            duration: 0.5,
            ease: 'power3.out',
            stagger: 0.07,
            immediateRender: false,
            clearProps: 'opacity,transform',
          },
        );
      }

      return () => cartCleanup?.();
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}
