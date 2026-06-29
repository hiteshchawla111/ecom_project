'use client';

import { useRef, type ElementType, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { prefersReducedMotion } from './prefers-reduced-motion';

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Scroll-reveal wrapper. Fades + lifts its children into view as the element
 * scrolls into the viewport, optionally staggering its direct children.
 *
 * Motion-only and SSR-safe: the markup renders normally on the server and is
 * fully visible without JS. GSAP runs client-side via useGSAP (auto-cleanup),
 * and the whole effect is skipped when the user prefers reduced motion — in
 * that case nothing is animated and content is shown immediately.
 *
 * Purely presentational: it wraps existing markup, never changes data flow.
 */
export interface RevealProps {
  children: ReactNode;
  /** Element to render as the wrapper (default div). */
  as?: ElementType;
  /** Stagger direct children instead of animating the wrapper as one block. */
  stagger?: boolean;
  /** Per-item / block delay step in seconds when staggering. */
  step?: number;
  /** Initial vertical offset in px (the "lift" distance). */
  y?: number;
  /** Extra classes for the wrapper. */
  className?: string;
}

export function Reveal({
  children,
  as,
  stagger = false,
  step = 0.06,
  y = 24,
  className,
}: RevealProps) {
  const Tag = (as ?? 'div') as ElementType;
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;

      // Respect the user's reduced-motion preference — show content, no motion.
      if (prefersReducedMotion()) return;

      const targets = stagger ? Array.from(root.children) : root;

      // fromTo with immediateRender:false is failure-safe: the element is never
      // hidden until the ScrollTrigger actually fires, so if the trigger never
      // runs the content simply stays in its natural (visible) state. clearProps
      // removes inline styles once revealed so hover/layout stay clean.
      gsap.fromTo(
        targets,
        { opacity: 0, y },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          ease: 'power2.out',
          stagger: stagger ? step : 0,
          immediateRender: false,
          clearProps: 'opacity,transform',
          scrollTrigger: {
            trigger: root,
            start: 'top 90%',
            once: true,
          },
        },
      );

      // The grid often sits within the first viewport on tall screens; refresh
      // so ScrollTrigger recomputes positions after images/layout settle.
      ScrollTrigger.refresh();
    },
    { scope: ref },
  );

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
