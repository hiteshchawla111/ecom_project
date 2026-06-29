'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice } from '@/lib/money';
import { useCart } from '@/components/cart/CartProvider';
import type { CartView } from '@/lib/api-cart';

const FIELDS = [
  { name: 'shipFullName', label: 'Full name', required: true, autoComplete: 'name', span: 'full' },
  { name: 'shipLine1', label: 'Address line 1', required: true, autoComplete: 'address-line1', span: 'full' },
  { name: 'shipLine2', label: 'Address line 2 (optional)', required: false, autoComplete: 'address-line2', span: 'full' },
  { name: 'shipCity', label: 'City', required: true, autoComplete: 'address-level2', span: 'half' },
  { name: 'shipState', label: 'State', required: true, autoComplete: 'address-level1', span: 'half' },
  { name: 'shipCountry', label: 'Country', required: true, autoComplete: 'country-name', span: 'half' },
  { name: 'shipPostalCode', label: 'Postal code', required: true, autoComplete: 'postal-code', span: 'half' },
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
    <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-12">
      <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-6" noValidate>
        <h2 className="font-heading text-xl font-medium text-content">
          Shipping details
        </h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <label
              key={f.name}
              className={`flex flex-col gap-2 ${f.span === 'full' ? 'sm:col-span-2' : ''}`}
            >
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-content-subtle">
                {f.label}
                {f.required && <span className="text-primary-600"> *</span>}
              </span>
              <input
                name={f.name}
                value={form[f.name]}
                required={f.required}
                autoComplete={f.autoComplete}
                onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
                className="border border-line bg-surface px-3.5 py-3 text-sm text-content transition-colors focus:border-content focus:outline-none focus:ring-1 focus:ring-content"
              />
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm text-error-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="mt-2 w-full bg-content py-4 text-xs font-medium uppercase tracking-[0.16em] text-surface transition-colors duration-300 hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-40 sm:w-auto sm:self-start sm:px-12"
        >
          {pending ? 'Placing order…' : 'Place order'}
        </button>
      </form>

      <aside className="w-full shrink-0 border border-line bg-surface p-7 lg:w-96 lg:sticky lg:top-[calc(var(--header-h)+2rem)]">
        <h2 className="mb-5 font-heading text-xl font-medium text-content">
          Order review
        </h2>
        <ul className="flex flex-col gap-3 text-sm">
          {cart.items.map((item) => (
            <li key={item.productId} className="flex justify-between gap-3">
              <span className="min-w-0 flex-1 truncate text-content-muted">
                {item.name}
                <span className="text-content-subtle"> × {item.quantity}</span>
              </span>
              <span className="tabular-nums text-content">
                {formatPrice(item.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="mt-5 flex flex-col gap-3 border-t border-line pt-5 text-sm">
          {/* discountTotal intentionally omitted — discounts/coupons are out of PRD scope (always 0.00) */}
          <Row label="Subtotal" value={cart.totals.subtotal} />
          <Row label="Tax" value={cart.totals.taxTotal} />
          <Row label="Shipping" value={cart.totals.shippingTotal} />
          <div className="mt-3 border-t border-line pt-4">
            <Row label="Total" value={cart.totals.grandTotal} bold />
          </div>
        </dl>
        <p className="mt-5 flex items-center gap-2 text-xs text-content-subtle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
            <path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5z" />
          </svg>
          Secure checkout — your details are protected.
        </p>
      </aside>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className={bold ? 'font-medium text-content' : 'text-content-muted'}>{label}</dt>
      <dd
        className={
          bold
            ? 'font-heading text-lg font-medium tabular-nums text-content'
            : 'tabular-nums text-content'
        }
      >
        {formatPrice(value)}
      </dd>
    </div>
  );
}
