// src/app/account/seller/page.tsx
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/session';
import { liveAuthedDeps } from '@/lib/api-authed';
import { ApiAuthError } from '@/lib/api-auth';
import { getSellerMe } from '@/lib/seller-api';
import type { SellerView } from '@/lib/seller';
import { SellerStatusCard } from '@/components/seller/SellerStatusCard';
import { SellerKycForm } from '@/components/seller/SellerKycForm';

export const metadata: Metadata = { title: 'My shop' };

export default async function SellerAccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/account/seller');
  if (user.role !== 'SELLER') redirect('/sell');

  let seller: SellerView;
  try {
    seller = await getSellerMe(await liveAuthedDeps());
  } catch (err) {
    if (err instanceof ApiAuthError && err.status === 401) redirect('/login');
    throw err;
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 pb-24 pt-12">
      <header className="flex flex-col gap-2 border-b border-line pb-8">
        <span className="text-xs font-medium uppercase tracking-[0.28em] text-content-subtle">
          Seller dashboard
        </span>
        <h1 className="font-heading text-4xl font-medium tracking-[-0.01em] text-content sm:text-5xl">
          My shop
        </h1>
        <p className="text-sm text-content-muted">
          Your seller status and verification details.
        </p>
      </header>
      <SellerStatusCard seller={seller} />
      <section className="flex flex-col gap-5 border-t border-line pt-8">
        <h2 className="font-heading text-2xl font-medium text-content">
          Tax &amp; bank details
        </h2>
        <SellerKycForm seller={seller} />
      </section>
    </main>
  );
}
