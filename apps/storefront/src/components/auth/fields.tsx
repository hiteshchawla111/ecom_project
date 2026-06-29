'use client';

import { useId } from 'react';

interface TextFieldProps {
  label: string;
  name: string;
  type?: 'text' | 'email' | 'password';
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
}

/** Accessible labelled input wired to design-token classes. */
export function TextField({
  label,
  name,
  type = 'text',
  value,
  onChange,
  autoComplete,
  required,
  hint,
}: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-xs font-medium uppercase tracking-[0.14em] text-content-subtle"
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.value)}
        className="border border-line bg-surface px-3.5 py-3 text-sm text-content outline-none transition-colors focus:border-content focus:ring-1 focus:ring-content"
      />
      {hint ? (
        <p id={hintId} className="text-xs text-content-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Inline error region announced to assistive tech. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md bg-error-500/10 px-3 py-2 text-sm text-error-600"
    >
      {message}
    </p>
  );
}

/** Primary submit button with a pending state. */
export function SubmitButton({
  pending,
  children,
}: {
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 w-full bg-content py-3.5 text-xs font-medium uppercase tracking-[0.16em] text-surface transition-colors duration-300 hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Please wait…' : children}
    </button>
  );
}
