import Link from 'next/link';

/**
 * Editorial "bands" that break up the product rows on the home page and give
 * the scroll a narrative rhythm. All presentational and static — no data, no
 * API. Tokens only (brand/surface/content), so they flip cleanly in dark mode.
 */

/** Full-width brand-tinted promo band with a single CTA. */
export function PromoBanner() {
  return (
    <section className="relative isolate overflow-hidden rounded-3xl bg-primary-500 px-6 py-12 text-surface shadow-md sm:px-12 sm:py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-surface/15 blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 left-1/3 h-64 w-64 rounded-full bg-secondary-500/30 blur-3xl"
      />
      <div className="relative flex flex-col items-start gap-5 sm:max-w-2xl">
        <span className="rounded-full bg-surface/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] backdrop-blur">
          The season edit
        </span>
        <h2 className="font-heading text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          Fresh picks, restocked weekly.
        </h2>
        <p className="text-base/relaxed text-surface/90">
          New arrivals drop every week across every category. Find this week’s
          edit and shop before it’s gone.
        </p>
        <Link
          href="/products?sortBy=createdAt&sortDir=desc"
          className="rounded-full bg-surface px-7 py-3.5 text-sm font-semibold text-primary-700 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-surface focus-visible:ring-offset-2 focus-visible:ring-offset-primary-500"
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
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">
          Why Coral Market
        </span>
        <h2 className="font-heading text-3xl font-extrabold tracking-tight text-content sm:text-4xl">
          Shopping, made simple.
        </h2>
      </div>
      <ul className="grid gap-5 sm:grid-cols-3">
        {VALUE_PROPS.map((vp) => (
          <li
            key={vp.title}
            className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 shadow-sm transition-shadow duration-200 hover:shadow-md"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
              {vp.icon}
            </span>
            <h3 className="font-heading text-lg font-bold text-content">
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
    <section className="relative isolate overflow-hidden rounded-3xl border border-line bg-surface-muted px-6 py-12 sm:px-12 sm:py-14">
      <div className="relative flex flex-col items-center gap-5 text-center">
        <h2 className="font-heading text-2xl font-extrabold tracking-tight text-content sm:text-3xl">
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
            className="h-12 flex-1 rounded-full border border-line bg-surface px-5 text-sm text-content placeholder:text-content-subtle focus:border-primary-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
          />
          <button
            type="submit"
            className="h-12 shrink-0 rounded-full bg-primary-500 px-7 text-sm font-semibold text-surface shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-muted"
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
