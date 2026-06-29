import Link from 'next/link';
import { HeroMotion } from './HeroMotion';

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
      className="relative isolate overflow-hidden rounded-3xl border border-line bg-surface px-6 py-12 shadow-sm sm:px-10 sm:py-14 lg:px-14 lg:py-20"
    >
      {/* Ambient brand glow — soft, perf-cheap radial tints for depth. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary-500/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 right-1/4 h-72 w-72 rounded-full bg-secondary-500/10 blur-3xl"
      />

      <div className="relative grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        {/* Left — the pitch */}
        <div className="flex flex-col gap-7">
          <span
            data-hero="eyebrow"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-line bg-surface-sunk px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-content-muted"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary-500" aria-hidden="true" />
            New season · Free returns
          </span>

          <h1
            data-hero="headline"
            className="font-heading text-[clamp(2.5rem,6vw,4.5rem)] font-extrabold leading-[1.0] tracking-tight text-content"
          >
            <span className="block overflow-hidden pb-1">
              <span data-hero="line" className="block">
                Everyday essentials,
              </span>
            </span>
            <span className="block overflow-hidden pb-1">
              <span data-hero="line" className="block">
                <span className="relative inline-block">
                  seasonal finds.
                  <svg
                    data-hero="underline"
                    aria-hidden="true"
                    viewBox="0 0 320 16"
                    preserveAspectRatio="none"
                    className="absolute -bottom-1 left-0 h-3 w-full text-primary-500"
                  >
                    <path
                      d="M2 11 C 80 4, 240 4, 318 9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="4"
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
            A curated catalog delivered with care. Browse the latest arrivals or
            shop straight from a category.
          </p>

          <div data-hero="actions" className="flex flex-wrap items-center gap-3">
            <Link
              href={primaryCtaHref}
              className="rounded-full bg-primary-500 px-7 py-3.5 text-sm font-semibold text-surface shadow-md transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary-600 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Shop products
            </Link>
            <Link
              href={secondaryCtaHref}
              className="group inline-flex items-center gap-1.5 rounded-full border border-line px-6 py-3.5 text-sm font-semibold text-content transition-colors duration-150 hover:border-primary-300 hover:text-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
            >
              Browse categories
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
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
