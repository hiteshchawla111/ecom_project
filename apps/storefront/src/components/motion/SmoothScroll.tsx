'use client';

import { useRef, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { useGSAP } from '@gsap/react';
import { prefersReducedMotion } from './prefers-reduced-motion';

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollSmoother);

/**
 * Site-wide momentum smooth-scrolling via GSAP ScrollSmoother. Wraps page
 * content in the required #smooth-wrapper / #smooth-content structure.
 *
 * Important interplay with the layout:
 * - The sticky site header must live OUTSIDE this wrapper (ScrollSmoother
 *   transforms #smooth-content, which breaks position: sticky inside it).
 * - When the user prefers reduced motion, ScrollSmoother is NOT created — the
 *   page falls back to native scroll, and the wrapper divs are inert. This also
 *   means all our other ScrollTriggers keep working on native scroll.
 *
 * Presentational/behavioral only: it changes how the page scrolls, never what
 * data is rendered.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;

      const smoother = ScrollSmoother.create({
        wrapper: wrapper.current!,
        content: content.current!,
        smooth: 1.6, // seconds of "catch up" — slow, unhurried luxury glide
        effects: true, // enable data-speed / data-lag parallax on children
        normalizeScroll: true, // smooths mobile address-bar jumpiness
      });

      return () => {
        smoother.kill();
      };
    },
    { scope: wrapper },
  );

  return (
    <div ref={wrapper} id="smooth-wrapper">
      <div ref={content} id="smooth-content">
        {children}
      </div>
    </div>
  );
}
