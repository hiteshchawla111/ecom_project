'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface FilterSelectOption {
  value: string;
  label: string;
}

export interface FilterSelectProps {
  /** Form field name — written to a hidden input so the GET form submits it. */
  name: string;
  /** Accessible label (the visible <label> uses htmlFor=id). */
  id: string;
  ariaLabel: string;
  options: FilterSelectOption[];
  defaultValue: string;
  placeholder?: string;
  /** Navigate immediately on change (instant filter feel) instead of waiting
   *  for the Apply button. */
  submitOnChange?: boolean;
}

/** Radix Select forbids an empty-string item value, so represent "no value"
 *  with a sentinel and translate back to "" for the submitted hidden input. */
const EMPTY = '__all';

/**
 * A shadcn Select that participates in the catalog's GET filter form.
 *
 * - Default (Apply-button) mode: the value is mirrored into a hidden input so
 *   submitting the form sends the right param.
 * - `submitOnChange` mode: selecting an option navigates immediately by
 *   updating the URL search params directly (deterministic — no reliance on
 *   async state being flushed before a form submit). Page resets to 1.
 *
 * Presentational/behavioral wrapper only: it changes how the control looks and
 * feels, never what data is requested.
 */
export function FilterSelect({
  name,
  id,
  ariaLabel,
  options,
  defaultValue,
  placeholder,
  submitOnChange = false,
}: FilterSelectProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(defaultValue === '' ? EMPTY : defaultValue);

  function handleChange(next: string) {
    setValue(next);
    if (!submitOnChange) return;

    // Navigate directly from `next` (not from async state) so the new value is
    // always the one applied. Reset pagination on a filter change.
    const params = new URLSearchParams(searchParams.toString());
    const real = next === EMPTY ? '' : next;
    if (real) params.set(name, real);
    else params.delete(name);
    params.delete('page');
    router.push(`/products?${params.toString()}`);
  }

  return (
    <>
      <input type="hidden" name={name} value={value === EMPTY ? '' : value} />
      <Select value={value} onValueChange={handleChange}>
        <SelectTrigger
          id={id}
          aria-label={ariaLabel}
          className="w-full rounded-none border-line bg-surface py-5 text-sm text-content"
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="rounded-none border-line">
          <SelectGroup>
            {options.map((o) => (
              <SelectItem
                key={o.value || EMPTY}
                value={o.value === '' ? EMPTY : o.value}
                className="rounded-none"
              >
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  );
}
