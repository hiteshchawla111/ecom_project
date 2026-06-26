// src/components/seller/SellerKycForm.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormError, SubmitButton, TextField } from '@/components/auth/fields';
import { validateKyc, type SellerView, type UpdateSellerInput } from '@/lib/seller';

interface ErrorBody {
  message?: string;
}

export function SellerKycForm({ seller }: { seller: SellerView }) {
  const router = useRouter();
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input: UpdateSellerInput = { gstin, pan, bankAccountNo, bankIfsc };
    const errors = validateKyc(input);
    const firstError = Object.values(errors)[0];
    if (firstError) {
      setError(firstError);
      return;
    }
    // Only send non-empty fields (never wipe stored KYC with a blank submit).
    const payload: Record<string, string> = {};
    if (gstin.trim()) payload.gstin = gstin.trim();
    if (pan.trim()) payload.pan = pan.trim();
    if (bankAccountNo.trim()) payload.bankAccountNo = bankAccountNo.trim();
    if (bankIfsc.trim()) payload.bankIfsc = bankIfsc.trim();
    if (Object.keys(payload).length === 0) {
      setError('Enter at least one detail to save.');
      return;
    }

    setError(null);
    setPending(true);
    try {
      const res = await fetch('/api/seller/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as ErrorBody | null;
        setError(data?.message ?? 'Could not save your details. Please try again.');
        return;
      }
      // Refresh so SellerStatusCard reflects the new presence flags.
      router.refresh();
      setGstin('');
      setPan('');
      setBankAccountNo('');
      setBankIfsc('');
    } catch {
      setError('Unable to reach the server. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <p className="text-sm text-content-muted">
        Tax and bank details are encrypted and used for verification only. Leave a field
        blank to keep its stored value unchanged.
        {seller.panPresent ? ' Your PAN is already on file.' : ''}
      </p>
      <TextField label="PAN" name="pan" value={pan} onChange={setPan} hint="e.g. ABCDE1234F" />
      <TextField label="GSTIN" name="gstin" value={gstin} onChange={setGstin} hint="15 characters" />
      <TextField
        label="Bank account number"
        name="bankAccountNo"
        value={bankAccountNo}
        onChange={setBankAccountNo}
        hint="9–18 digits"
      />
      <TextField label="IFSC" name="bankIfsc" value={bankIfsc} onChange={setBankIfsc} hint="e.g. HDFC0001234" />
      <SubmitButton pending={pending}>Save details</SubmitButton>
    </form>
  );
}
