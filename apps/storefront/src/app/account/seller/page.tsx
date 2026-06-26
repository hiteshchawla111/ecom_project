// src/app/account/seller/page.tsx
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/session';
import { liveAuthedDeps } from '@/lib/api-authed';
import { ApiAuthError } from '@/lib/api-auth';
import { getSellerMe, type SellerView } from '@/lib/seller';
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-content">My shop</h1>
        <p className="text-sm text-content-muted">
          Your seller status and verification details.
        </p>
      </header>
      <SellerStatusCard seller={seller} />
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-content">Tax &amp; bank details</h2>
        <SellerKycForm seller={seller} />
      </section>
    </main>
  );
}
