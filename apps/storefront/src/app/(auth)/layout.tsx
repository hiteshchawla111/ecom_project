/**
 * Split editorial auth layout: a branded image panel beside the form. The
 * panel is decorative and hidden on small screens; the form column always
 * shows. Individual auth pages render their own heading + form inside.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid flex-1 lg:grid-cols-2">
      {/* Brand panel — editorial, image-backed, hidden on mobile. */}
      <aside className="relative hidden overflow-hidden bg-neutral-900 lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://picsum.photos/seed/coral-auth/1200/1600"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-70"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-neutral-900/90 via-neutral-900/40 to-neutral-900/30"
        />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <span className="font-heading text-2xl font-medium tracking-tight">
            Coral&nbsp;Market
          </span>
          <div className="flex flex-col gap-4">
            <p className="font-heading text-3xl font-medium leading-tight tracking-[-0.01em] xl:text-4xl">
              Everyday essentials, seasonal finds — curated and delivered with
              care.
            </p>
            <p className="text-sm uppercase tracking-[0.2em] text-white/60">
              Join the Coral Market
            </p>
          </div>
        </div>
      </aside>

      {/* Form column. */}
      <div className="flex items-center justify-center px-6 py-16 sm:px-10">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </main>
  );
}
