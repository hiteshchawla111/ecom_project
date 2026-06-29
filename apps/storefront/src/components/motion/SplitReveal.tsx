'use client';

import { useRef, type ElementType, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';
import { prefersReducedMotion } from './prefers-reduced-motion';

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

export interface SplitRevealProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  /** Animate by 'words' (default) or 'chars' for a finer reveal. */
  unit?: 'words' | 'chars';
  /** Run on scroll into view (default) or immediately on mount. */
  trigger?: 'scroll' | 'load';
  /** Stagger step between units (seconds). */
  step?: number;
}

/**
 * Headline reveal that splits text into words/chars and rises each unit from
 * behind a clip mask. Uses GSAP SplitText, then reverts the split on cleanup so
 * the DOM returns to plain text (good for a11y and selection).
 *
 * SSR/reduced-motion safe: server renders the real text; if motion is reduced
 * or JS doesn't run, the text is simply shown as-is.
 */
export function SplitReveal({
  children,
  as,
  className,
  unit = 'words',
  trigger = 'scroll',
  step = 0.04,
}: SplitRevealProps) {
  const Tag = (as ?? 'div') as ElementType;
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const root = ref.current;
      if (!root || prefersReducedMotion()) return;

      const split = new SplitText(root, {
        type: unit,
        // mask makes each unit rise from behind a clip — the premium look.
        mask: unit,
      });
      const targets = unit === 'chars' ? split.chars : split.words;

      const tween = gsap.from(targets, {
        yPercent: 120,
        opacity: 0,
        duration: 0.8,
        ease: 'power4.out',
        stagger: step,
        ...(trigger === 'scroll'
          ? {
              immediateRender: false,
              scrollTrigger: { trigger: root, start: 'top 85%', once: true },
            }
          : {}),
      });

      return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
        split.revert();
      };
    },
    { scope: ref },
  );

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
