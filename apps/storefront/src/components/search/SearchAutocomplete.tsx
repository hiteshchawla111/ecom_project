'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProductSuggestion } from '@/lib/catalog';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;
const LISTBOX_ID = 'search-suggestions';

/** Effective display price: sale price when present, else the regular price. */
function displayPrice(s: ProductSuggestion): string {
  return s.salePrice ?? s.price;
}

/**
 * Accessible, debounced autocomplete combobox for the header. Suggestions come
 * from the same-origin /api/products/suggest proxy. Enter (with nothing
 * highlighted) submits the term to the faceted /products?search= page. A failed
 * suggest just yields no dropdown — typing + submit still work.
 */
export function SearchAutocomplete() {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1); // index into suggestions; -1 = none
  const reqId = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Debounced suggest fetch with a stale-response guard.
  useEffect(() => {
    const q = term.trim();
    // Term too short — clear suggestions. Schedule as a microtask so the state
    // update is not synchronous within the effect body (avoids the
    // react-hooks/set-state-in-effect lint rule for the early-return path).
    if (q.length < MIN_CHARS) {
      const clear = setTimeout(() => {
        setSuggestions([]);
        setOpen(false);
      }, 0);
      return () => clearTimeout(clear);
    }
    const id = ++reqId.current;
    const timer = setTimeout(() => {
      const result = fetch(`/api/products/suggest?q=${encodeURIComponent(q)}&limit=8`);
      // Guard: fetch must return a Promise (always true in production; protects
      // against unmocked fetch in tests where the component unmounts mid-flight).
      if (!result || typeof result.then !== 'function') return;
      result
        .then((r) => (r.ok ? r.json() : []))
        .then((data: ProductSuggestion[]) => {
          if (id !== reqId.current) return; // stale
          setSuggestions(Array.isArray(data) ? data : []);
          setOpen((Array.isArray(data) ? data.length : 0) > 0);
          setActive(-1);
        })
        .catch(() => {
          if (id !== reqId.current) return;
          setSuggestions([]);
          setOpen(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  // Close on click outside.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function goToSearch() {
    const q = term.trim();
    if (q.length === 0) return;
    setOpen(false);
    router.push(`/products?search=${encodeURIComponent(q)}`);
  }

  function selectSuggestion(s: ProductSuggestion) {
    setOpen(false);
    router.push(`/products/${s.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      setActive((i) => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && active >= 0 && active < suggestions.length) {
        selectSuggestion(suggestions[active]);
      } else {
        goToSearch();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const fieldClass =
    'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-content focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <div ref={rootRef} className="relative w-full max-w-sm">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          goToSearch();
        }}
      >
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={LISTBOX_ID}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `suggestion-${active}` : undefined}
          aria-label="Search products"
          placeholder="Search products"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          className={fieldClass}
        />
      </form>
      {open && suggestions.length > 0 && (
        <ul
          id={LISTBOX_ID}
          role="listbox"
          aria-label="Product suggestions"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-line bg-surface shadow-md"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`suggestion-${i}`}
              role="option"
              aria-selected={i === active}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                i === active ? 'bg-primary-50 text-primary-700' : 'text-content hover:bg-neutral-50'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                selectSuggestion(s);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="truncate">{s.name}</span>
              <span className="shrink-0 text-content-subtle">{displayPrice(s)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
