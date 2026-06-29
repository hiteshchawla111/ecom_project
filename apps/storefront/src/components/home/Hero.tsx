import Link from 'next/link';
import { HeroMotion } from './HeroMotion';
import { MagneticButton } from '@/components/motion/MagneticButton';

/** A single product surfaced in the hero collage. */
export interface HeroShowcaseItem {
  id: string;
  name: string;
  imageUrl: string;
  href: string;
}

export interface HeroProps {
  primaryCtaHref?: string;
  secondaryCtaHref?: string;
  /**
   * Optional product imagery for the right-hand collage. When empty (e.g. the
   * catalog API is unavailable) the hero degrades to a clean single-column
   * layout — no broken image frames.
   */
  showcase?: HeroShowcaseItem[];
}

/**
 * Home-page hero. A split editorial composition: an oversized, typography-led
 * pitch on the left and a layered product collage on the right, set over a
 * soft brand-tinted glow for depth. The accented keyword gets a coral underline
 * sweep. Static marketing copy with two CTAs; presentational and prop-driven so
 * it stays unit-testable.
 *
 * Motion (word rise, underline draw, collage float-in) is handled client-side
 * by {@link HeroMotion}, which is reduced-motion-safe and leaves this server-
 * rendered markup fully visible without JS.
 */
export function Hero({
  primaryCtaHref = '/products',
  secondaryCtaHref = '/categories',
  showcase = [],
}: HeroProps) {
  const hasShowcase = showcase.length > 0;

  return (
    <HeroMotion
      as="section"
      className="relative isolate overflow-hidden border-b border-line pb-16 pt-8 sm:pb-20 sm:pt-12 lg:pb-24"
    >
      {/* A single, very soft brand wash — restraint over decoration. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-40 h-96 w-96 rounded-full bg-primary-500/10 blur-3xl"
      />

      <div className="relative grid items-center gap-14 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left — the pitch */}
        <div className="flex flex-col gap-8">
          <span
            data-hero="eyebrow"
            className="inline-flex w-fit items-center gap-3 text-xs font-medium uppercase tracking-[0.28em] text-content-muted"
          >
            <span className="h-px w-10 bg-content-subtle" aria-hidden="true" />
            New season
          </span>

          <h1
            data-hero="headline"
            className="font-heading text-[clamp(2.75rem,6.5vw,5.25rem)] font-normal leading-[1.05] tracking-[-0.01em] text-content"
          >
            <span className="block overflow-hidden pb-2">
              <span data-hero="line" className="block">
                Everyday essentials,
              </span>
            </span>
            <span className="block overflow-hidden pb-2">
              <span data-hero="line" className="block">
                <span className="relative inline-block italic">
                  seasonal finds.
                  <svg
                    data-hero="underline"
                    aria-hidden="true"
                    viewBox="0 0 320 12"
                    preserveAspectRatio="none"
                    className="absolute -bottom-2 left-0 h-2 w-full text-primary-500"
                  >
                    <path
                      d="M2 8 C 80 3, 240 3, 318 6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </span>
            </span>
          </h1>

          <p
            data-hero="lede"
            className="max-w-md text-lg leading-relaxed text-content-muted"
          >
            A curated catalog, delivered with care. Discover the latest arrivals
            or shop straight from a category.
          </p>

          <div data-hero="actions" className="flex flex-wrap items-center gap-6">
            <MagneticButton
              href={primaryCtaHref}
              className="inline-block bg-content px-8 py-4 text-sm font-medium uppercase tracking-[0.12em] text-surface transition-colors duration-300 hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-sunk"
            >
              Shop the collection
            </MagneticButton>
            <Link
              href={secondaryCtaHref}
              className="group inline-flex items-center gap-2 border-b border-content/30 pb-1 text-sm font-medium text-content transition-colors duration-300 hover:border-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
            >
              Browse categories
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* Trust strip — grounds the pitch with real reassurances. */}
          <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-6 text-sm">
            {TRUST.map((t) => (
              <div key={t.label} className="flex items-center gap-2">
                <span className="text-primary-500">{t.icon}</span>
                <dt className="sr-only">{t.label}</dt>
                <dd className="font-medium text-content-muted">{t.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Right — layered product collage (hidden gracefully if no imagery) */}
        {hasShowcase && (
          <div
            data-hero="showcase"
            className="relative hidden h-[420px] lg:block"
            aria-hidden="true"
          >
            {showcase.slice(0, 3).map((item, i) => (
              <div
                key={item.id}
                data-hero="tile"
                className={COLLAGE_POSITIONS[i]}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl}
                  alt=""
                  loading="eager"
                  className="h-full w-full rounded-2xl border border-line object-cover shadow-lg"
                />
              </div>
            ))}
            {/* Floating "new" chip on the lead tile */}
            <span
              data-hero="chip"
              className="absolute right-4 top-4 z-10 rounded-full bg-surface/95 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-primary-700 shadow-md backdrop-blur"
            >
              Just in
            </span>
          </div>
        )}
      </div>
    </HeroMotion>
  );
}

/** Tile placement for the 3-image overlapping collage. */
const COLLAGE_POSITIONS = [
  'absolute right-0 top-0 h-72 w-56 rotate-2',
  'absolute bottom-0 left-0 h-56 w-44 -rotate-3',
  'absolute bottom-10 right-16 h-40 w-36 rotate-1',
] as const;

const TRUST = [
  {
    label: 'Free shipping over $50',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
      </svg>
    ),
  },
  {
    label: 'Secure checkout',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5z" />
      </svg>
    ),
  },
  {
    label: '30-day easy returns',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5" />
      </svg>
    ),
  },
] as const;
