'use client';

import { useState } from 'react';
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
  /** Submit the closest form on change for an instant, app-like filter feel. */
  submitOnChange?: boolean;
}

/**
 * A shadcn Select that participates in the catalog's GET filter form. The
 * chosen value is mirrored into a hidden input (so the form still submits the
 * right param and works as a normal query-string navigation), and — when
 * `submitOnChange` — selecting an option submits the form immediately.
 *
 * Presentational/behavioral wrapper only: it changes how the control looks and
 * feels, never what data is requested (the page still parses the same params).
 */
/** Radix Select forbids an empty-string item value, so represent "no value"
 *  with a sentinel and translate back to "" for the submitted hidden input. */
const EMPTY = '__all';

export function FilterSelect({
  name,
  id,
  ariaLabel,
  options,
  defaultValue,
  placeholder,
  submitOnChange = false,
}: FilterSelectProps) {
  const [value, setValue] = useState(defaultValue === '' ? EMPTY : defaultValue);

  function handleChange(next: string) {
    setValue(next);
    if (submitOnChange) {
      (document.getElementById(id) as HTMLElement | null)
        ?.closest('form')
        ?.requestSubmit();
    }
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
