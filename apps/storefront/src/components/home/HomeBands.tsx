import Link from 'next/link';

/**
 * Editorial "bands" that break up the product rows on the home page and give
 * the scroll a narrative rhythm. All presentational and static — no data, no
 * API. Tokens only (brand/surface/content), so they flip cleanly in dark mode.
 */

/** Full-width brand-tinted promo band with a single CTA. */
export function PromoBanner() {
  return (
    <section className="relative isolate overflow-hidden rounded-lg bg-neutral-900 px-8 py-16 text-white sm:px-16 sm:py-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary-500/20 blur-3xl"
      />
      <div className="relative flex flex-col items-start gap-6 sm:max-w-2xl">
        <span className="inline-flex items-center gap-3 text-xs font-medium uppercase tracking-[0.28em] text-white/60">
          <span className="h-px w-10 bg-white/40" aria-hidden="true" />
          The season edit
        </span>
        <h2 className="font-heading text-4xl font-medium leading-tight tracking-[-0.01em] sm:text-5xl">
          Fresh picks, restocked weekly.
        </h2>
        <p className="max-w-lg text-base leading-relaxed text-white/70">
          New arrivals drop every week across every category. Discover this
          week’s edit and shop before it’s gone.
        </p>
        <Link
          href="/products?sortBy=createdAt&sortDir=desc"
          className="mt-2 inline-block bg-white px-8 py-4 text-sm font-medium uppercase tracking-[0.12em] text-neutral-900 transition-colors duration-300 hover:bg-primary-500 hover:text-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
        >
          Explore the edit
        </Link>
      </div>
    </section>
  );
}

/** Three value-prop cards — the "why shop with us" reassurance band. */
export function ValueProps() {
  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5 border-b border-line pb-5">
        <span className="text-xs font-medium uppercase tracking-[0.28em] text-content-subtle">
          Why Coral Market
        </span>
        <h2 className="font-heading text-4xl font-medium tracking-[-0.01em] text-content sm:text-5xl">
          Shopping, made simple.
        </h2>
      </div>
      <ul className="grid gap-5 sm:grid-cols-3">
        {VALUE_PROPS.map((vp) => (
          <li
            key={vp.title}
            className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-7 shadow-sm transition-shadow duration-200 hover:shadow-md"
          >
            <span className="flex h-12 w-12 items-center justify-center border border-line text-content">
              {vp.icon}
            </span>
            <h3 className="font-heading text-xl font-medium text-content">
              {vp.title}
            </h3>
            <p className="text-sm/relaxed text-content-muted">{vp.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Email-capture band. Visual only — wiring a backend is out of scope here. */
export function NewsletterBand() {
  return (
    <section className="relative isolate overflow-hidden rounded-lg border border-line bg-surface-muted px-6 py-12 sm:px-12 sm:py-14">
      <div className="relative flex flex-col items-center gap-5 text-center">
        <h2 className="font-heading text-3xl font-medium tracking-[-0.01em] text-content sm:text-4xl">
          Get first look at new arrivals.
        </h2>
        <p className="max-w-md text-sm/relaxed text-content-muted">
          Join the list for early access to weekly drops and members-only
          offers. No spam — unsubscribe anytime.
        </p>
        <form
          className="flex w-full max-w-md flex-col gap-2 sm:flex-row"
          // Presentational only — submission wiring is intentionally out of scope.
          aria-label="Newsletter sign-up"
        >
          <label htmlFor="newsletter-email" className="sr-only">
            Email address
          </label>
          <input
            id="newsletter-email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="flex-1 border border-line bg-surface px-5 py-3.5 text-sm text-content placeholder:text-content-subtle focus:border-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
          />
          <button
            type="submit"
            className="shrink-0 bg-content px-8 py-3.5 text-xs font-medium uppercase tracking-[0.12em] text-surface transition-colors duration-300 hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-muted"
          >
            Notify me
          </button>
        </form>
      </div>
    </section>
  );
}

const VALUE_PROPS = [
  {
    title: 'Curated, not cluttered',
    body: 'Every product is hand-picked, so you spend less time scrolling and more time finding.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <path d="m12 3 2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z" />
      </svg>
    ),
  },
  {
    title: 'Quick, tracked delivery',
    body: 'Free shipping over $50 and real-time order tracking from checkout to doorstep.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
      </svg>
    ),
  },
  {
    title: 'Easy, no-fuss returns',
    body: 'Changed your mind? Send it back within 30 days for a full refund — no questions asked.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5" />
      </svg>
    ),
  },
] as const;
