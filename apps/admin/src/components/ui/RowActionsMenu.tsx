import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

interface RowActionsMenuProps {
  /** Accessible name for the trigger, e.g. "Actions for Aurora Phone". */
  label: string;
  /** Menu items — typically <button>/<Link> elements. */
  children: ReactNode;
}

/**
 * A compact "⋯" row-actions menu. Collapses several per-row actions into one
 * trigger so dense tables stay calm and destructive actions sit one level down
 * rather than one stray click away.
 *
 * Accessibility: the trigger exposes aria-haspopup/aria-expanded; the menu
 * closes on outside click, on Escape, and after any item inside is activated
 * (click bubbles to the container). Keyboard users can tab to the trigger and
 * into the revealed items.
 */
export function RowActionsMenu({ label, children }: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative inline-block text-left" onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-muted hover:text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
      >
        <span aria-hidden="true" className="text-lg leading-none">
          ⋯
        </span>
      </button>

      {open && (
        // Activating any item inside closes the menu (the click bubbles here).
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className="absolute right-0 z-20 mt-1 flex w-44 flex-col gap-0.5 rounded-md border border-line bg-surface p-1 shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
}
