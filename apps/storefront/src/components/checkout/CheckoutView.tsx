'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice } from '@/lib/money';
import { useCart } from '@/components/cart/CartProvider';
import type { CartView } from '@/lib/api-cart';

const FIELDS = [
  { name: 'shipFullName', label: 'Full name', required: true },
  { name: 'shipLine1', label: 'Address line 1', required: true },
  { name: 'shipLine2', label: 'Address line 2 (optional)', required: false },
  { name: 'shipCity', label: 'City', required: true },
  { name: 'shipState', label: 'State', required: true },
  { name: 'shipCountry', label: 'Country', required: true },
  { name: 'shipPostalCode', label: 'Postal code', required: true },
] as const;

type FieldName = (typeof FIELDS)[number]['name'];

const EMPTY_FORM: Record<FieldName, string> = {
  shipFullName: '', shipLine1: '', shipLine2: '',
  shipCity: '', shipState: '', shipCountry: '', shipPostalCode: '',
};

interface OrderResult {
  id?: string;
  message?: string;
}

export function CheckoutView({ cart }: { cart: CartView }) {
  const router = useRouter();
  const { hydrate } = useCart();
  const [form, setForm] = useState<Record<FieldName, string>>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const requiredFilled = FIELDS.every((f) => !f.required || form[f.name].trim() !== '');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requiredFilled) {
      setError('Please fill in all required fields.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const body = (await res.json().catch(() => null)) as OrderResult | null;
      if (!res.ok || !body?.id) {
        setError(body?.message ?? 'Unable to place your order.');
        return;
      }
      // Server cart is cleared by the API; reset the client store so the badge drops to 0.
      hydrate({
        id: '',
        items: [],
        totals: { subtotal: '0.00', discountTotal: '0.00', taxTotal: '0.00', shippingTotal: '0.00', grandTotal: '0.00' },
      });
      router.push(`/orders/${body.id}`);
    } catch {
      setError('Unable to reach the server. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <form onSubmit={onSubmit} className="flex-1 flex flex-col gap-4" noValidate>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-600">Shipping details</h2>
        {FIELDS.map((f) => (
          <label key={f.name} className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-700">{f.label}</span>
            <input
              name={f.name}
              value={form[f.name]}
              required={f.required}
              onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
              className="rounded-md border border-neutral-300 px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
            />
          </label>
        ))}
        {error && <p className="text-sm text-error-500">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-2 inline-flex w-fit items-center justify-center rounded-md bg-primary-500 px-5 py-2.5 text-sm font-medium text-neutral-0 hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-50"
        >
          {pending ? 'Placing order…' : 'Place order'}
        </button>
      </form>

      <aside className="w-full shrink-0 rounded-lg border border-neutral-200 bg-neutral-0 p-6 lg:w-80">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-600">Order review</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {cart.items.map((item) => (
            <li key={item.productId} className="flex justify-between gap-2">
              <span className="min-w-0 truncate text-neutral-700">
                <span>{item.name}</span>
                {' × '}
                <span>{item.quantity}</span>
              </span>
              <span className="tabular-nums text-neutral-900">{formatPrice(item.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 flex flex-col gap-2 border-t border-neutral-200 pt-4 text-sm">
          {/* discountTotal intentionally omitted — discounts/coupons are out of PRD scope (always 0.00) */}
          <Row label="Subtotal" value={cart.totals.subtotal} />
          <Row label="Tax" value={cart.totals.taxTotal} />
          <Row label="Shipping" value={cart.totals.shippingTotal} />
          <div className="mt-2 border-t border-neutral-200 pt-2">
            <Row label="Total" value={cart.totals.grandTotal} bold />
          </div>
        </dl>
      </aside>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className={bold ? 'font-semibold text-neutral-900' : 'text-neutral-600'}>{label}</dt>
      <dd className={bold ? 'font-semibold text-neutral-900' : 'text-neutral-900'}>{formatPrice(value)}</dd>
    </div>
  );
}
