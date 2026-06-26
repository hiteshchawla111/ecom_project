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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-content">Sell with us</h1>
        <p className="text-sm text-content-muted">
          Apply to open a shop. We&apos;ll review your application and let you know
          when you can start listing products. You can add tax and bank details after
          you apply.
        </p>
      </header>
      <SellerRegisterForm />
    </main>
  );
}
