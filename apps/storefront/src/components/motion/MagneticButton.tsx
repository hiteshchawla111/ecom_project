'use client';

import { useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { prefersReducedMotion } from './prefers-reduced-motion';

gsap.registerPlugin(useGSAP);

export interface MagneticButtonProps {
  href: string;
  children: ReactNode;
  className?: string;
  /** Pull strength — fraction of cursor offset the button follows. */
  strength?: number;
}

/**
 * A link that is gently "pulled" toward the cursor while hovered and springs
 * back on leave. Pointer-only and reduced-motion-safe; it animates transform
 * only, so it never shifts surrounding layout. Renders a normal Next <Link> —
 * same navigation, same href, just a magnetic micro-interaction.
 */
export function MagneticButton({
  href,
  children,
  className,
  strength = 0.4,
}: MagneticButtonProps) {
  const ref = useRef<HTMLAnchorElement>(null);

  useGSAP(
    (_context, contextSafe) => {
      const el = ref.current;
      if (!el || prefersReducedMotion() || !contextSafe) return;
      if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        return;
      }

      const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
      const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });

      const onMove = contextSafe((e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * strength);
        yTo((e.clientY - (r.top + r.height / 2)) * strength);
      });
      const onLeave = contextSafe(() => {
        xTo(0);
        yTo(0);
      });

      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerleave', onLeave);
      return () => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerleave', onLeave);
      };
    },
    { scope: ref },
  );

  return (
    <Link ref={ref} href={href} className={className}>
      {children}
    </Link>
  );
}
