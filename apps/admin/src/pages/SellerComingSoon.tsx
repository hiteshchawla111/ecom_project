/**
 * Temporary placeholder for seller-only routes that land in later slices (6b, 6d).
 * Routes under SellerOnlyRoute resolve to this component until the real page is wired.
 */
export function SellerComingSoon({ area }: { area: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-heading text-2xl font-semibold text-content">{area}</h2>
      <p className="text-content-muted">This section is coming soon.</p>
    </section>
  );
}
