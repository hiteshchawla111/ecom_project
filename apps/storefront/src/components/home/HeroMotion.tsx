'use client';

import { useRef, type ElementType, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { useGSAP } from '@gsap/react';
import { prefersReducedMotion } from '@/components/motion/prefers-reduced-motion';

gsap.registerPlugin(useGSAP, ScrollTrigger, DrawSVGPlugin);

export interface HeroMotionProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
}

/**
 * Client-only motion wrapper for the home hero. Orchestrates a single page-load
 * sequence — eyebrow, headline lines, underline draw, lede, then CTAs — keyed
 * off the [data-hero="…"] hooks in {@link import('./Hero').Hero}.
 *
 * SSR-safe and reduced-motion-safe: the server markup is the source of truth
 * and is fully visible without JS or when the user prefers reduced motion. This
 * wrapper only animates existing nodes; it never changes structure or data.
 */
export function HeroMotion({ children, as, className }: HeroMotionProps) {
  const Tag = (as ?? 'div') as ElementType;
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;

      if (prefersReducedMotion()) return;

      const q = gsap.utils.selector(root);
      // clearProps on every tween: once the load sequence finishes, all inline
      // styles are removed so nothing can be left stuck invisible and the CSS
      // resting state (e.g. tile rotation) is restored.
      const tl = gsap.timeline({
        defaults: { ease: 'power3.out', duration: 0.6, clearProps: 'all' },
      });

      tl.from(q('[data-hero="eyebrow"]'), { opacity: 0, y: 12, duration: 0.4 })
        .from(
          q('[data-hero="line"]'),
          { opacity: 0, yPercent: 100, stagger: 0.08 },
          '-=0.1',
        )
        .from(
          q('[data-hero="underline"] path'),
          { drawSVG: '0%', duration: 0.6, ease: 'power2.inOut' },
          '-=0.2',
        )
        .from(q('[data-hero="lede"]'), { opacity: 0, y: 12 }, '-=0.3')
        .from(
          q('[data-hero="actions"] > *'),
          { opacity: 0, y: 12, stagger: 0.08, duration: 0.4 },
          '-=0.3',
        )
        .from(
          q('[data-hero="tile"]'),
          {
            opacity: 0,
            y: 32,
            scale: 0.92,
            stagger: 0.1,
            duration: 0.6,
            ease: 'back.out(1.4)',
          },
          '-=0.8',
        )
        .from(
          q('[data-hero="chip"]'),
          { opacity: 0, scale: 0.6, duration: 0.4 },
          '-=0.2',
        );

      // Scrubbed parallax: each collage tile drifts at its own rate as the hero
      // scrolls, giving the composition depth. Transform-only → cheap + smooth.
      const tiles = q('[data-hero="tile"]');
      tiles.forEach((tile, i) => {
        gsap.to(tile, {
          yPercent: -12 - i * 8,
          ease: 'none',
          scrollTrigger: {
            trigger: root,
            start: 'top top',
            end: 'bottom top',
            scrub: 1,
          },
        });
      });
    },
    { scope: ref },
  );

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
