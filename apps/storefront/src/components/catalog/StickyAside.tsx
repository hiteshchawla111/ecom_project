'use client';

import { useRef, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { prefersReducedMotion } from '@/components/motion/prefers-reduced-motion';

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Pins its content while the sibling grid scrolls past — a sticky filter rail.
 *
 * Native `position: sticky` doesn't work inside ScrollSmoother (it transforms
 * the scroll content, removing the scroll context sticky needs), so we pin via
 * ScrollTrigger, which is ScrollSmoother-aware. Only pins on large screens
 * where the rail sits beside the grid; on mobile (stacked) and under
 * reduced-motion it stays in normal flow. The pin end is the parent row, so the
 * rail un-pins exactly when the grid column ends.
 */
export function StickyAside({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || prefersReducedMotion()) return;

      const mm = gsap.matchMedia();
      mm.add('(min-width: 1024px)', () => {
        const st = ScrollTrigger.create({
          trigger: el,
          start: 'top top+=96', // clear the fixed header
          endTrigger: el.parentElement ?? el,
          end: 'bottom bottom',
          pin: el,
          pinSpacing: false,
        });
        return () => st.kill();
      });

      return () => mm.revert();
    },
    { scope: ref },
  );

  return <aside ref={ref}>{children}</aside>;
}
