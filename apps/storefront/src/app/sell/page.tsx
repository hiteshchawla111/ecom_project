// src/app/sell/page.tsx
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/session';
import { SellerRegisterForm } from '@/components/seller/SellerRegisterForm';

export const metadata: Metadata = { title: 'Sell with us' };

export default async function SellPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/sell');
  if (user.role === 'SELLER') redirect('/account/seller');

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 pb-24 pt-12">
      <header className="flex flex-col gap-2 border-b border-line pb-8">
        <span className="text-xs font-medium uppercase tracking-[0.28em] text-content-subtle">
          Become a seller
        </span>
        <h1 className="font-heading text-4xl font-medium tracking-[-0.01em] text-content sm:text-5xl">
          Open your shop
        </h1>
        <p className="max-w-lg text-sm leading-relaxed text-content-muted">
          Apply to open a shop. We’ll review your application and let you know when
          you can start listing products — you can add tax and bank details after
          you apply.
        </p>
      </header>
      <SellerRegisterForm />
    </main>
  );
}
