'use client';

import { useRef, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { prefersReducedMotion } from './prefers-reduced-motion';

gsap.registerPlugin(useGSAP);

export interface TiltCardProps {
  children: ReactNode;
  className?: string;
  /** Max tilt in degrees at the corners. */
  max?: number;
}

/**
 * Wraps content in a subtle 3D pointer-tilt. The card rotates toward the cursor
 * and lifts slightly; on leave it springs back to flat. Pointer-only (no effect
 * on touch / reduced-motion), and it never changes layout bounds — only
 * transform — so it can't cause jitter in surrounding content.
 */
export function TiltCard({ children, className, max = 8 }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    (_context, contextSafe) => {
      const el = ref.current;
      if (!el || prefersReducedMotion() || !contextSafe) return;
      // Pointer-tilt only makes sense with a fine pointer (mouse).
      if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        return;
      }

      const xTo = gsap.quickTo(el, 'rotationY', { duration: 0.4, ease: 'power3.out' });
      const yTo = gsap.quickTo(el, 'rotationX', { duration: 0.4, ease: 'power3.out' });

      const onMove = contextSafe((e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        xTo(px * max * 2);
        yTo(-py * max * 2);
      });

      const onEnter = contextSafe(() => {
        gsap.to(el, { scale: 1.02, duration: 0.4, ease: 'power3.out' });
      });

      const onLeave = contextSafe(() => {
        xTo(0);
        yTo(0);
        gsap.to(el, { scale: 1, duration: 0.5, ease: 'power3.out' });
      });

      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerenter', onEnter);
      el.addEventListener('pointerleave', onLeave);

      return () => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerenter', onEnter);
        el.removeEventListener('pointerleave', onLeave);
      };
    },
    { scope: ref },
  );

  return (
    <div
      ref={ref}
      className={className}
      style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
    >
      {children}
    </div>
  );
}
