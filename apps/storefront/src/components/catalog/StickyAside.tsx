'use client';

import { useRef, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Pins its content while the sibling grid scrolls past — a sticky filter rail.
 *
 * Native `position: sticky` doesn't work inside ScrollSmoother (it transforms
 * the scroll content, removing the scroll context sticky needs), so we pin via
 * ScrollTrigger, which is ScrollSmoother-aware. Pins on large screens only,
 * where the rail sits beside the grid; on mobile (stacked) it stays in normal
 * flow.
 *
 * Pinning is layout, not decorative motion, so it is NOT gated on
 * prefers-reduced-motion — a reduced-motion user still wants a sticky rail
 * (the pin itself involves no animation).
 */
export function StickyAside({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      const row = el?.parentElement;
      if (!el || !row) return;

      const mm = gsap.matchMedia();
      mm.add('(min-width: 1024px)', () => {
        const st = ScrollTrigger.create({
          trigger: el,
          start: 'top top+=96', // clear the fixed header
          endTrigger: row, // hold until the grid column (the taller sibling) ends
          end: 'bottom top+=96',
          pin: el,
          pinSpacing: false,
          invalidateOnRefresh: true,
        });
        // Recalculate once images/layout settle so start/end are correct.
        ScrollTrigger.refresh();
        return () => st.kill();
      });

      return () => mm.revert();
    },
    { scope: ref },
  );

  return <aside ref={ref}>{children}</aside>;
}
