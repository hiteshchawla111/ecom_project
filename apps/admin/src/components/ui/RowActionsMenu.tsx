import { Children, isValidElement, type ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

interface RowActionsMenuProps {
  /** Accessible name for the trigger, e.g. "Actions for Aurora Phone". */
  label: string;
  /** Menu items — `<button>`/`<Link>` elements; each is wrapped in a
   *  DropdownMenuItem so it gets Radix focus/keyboard handling and auto-close. */
  children: ReactNode;
}

/**
 * A compact "⋯" row-actions menu built on shadcn/Radix DropdownMenu. Collapses
 * several per-row actions into one trigger so dense tables stay calm and
 * destructive actions sit one level down. Accessibility (roles, keyboard nav,
 * outside-click/Escape close, focus management) is handled by Radix; selecting
 * an item closes the menu automatically.
 *
 * Call sites pass plain `<button>`/`<Link>` children; each is rendered via
 * `DropdownMenuItem asChild` so existing handlers/hrefs keep working.
 */
export function RowActionsMenu({ label, children }: RowActionsMenuProps) {
  const items = Children.toArray(children).filter(isValidElement);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className="inline-flex size-8 items-center justify-center text-content-muted transition-colors hover:bg-surface-muted hover:text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 data-[state=open]:bg-surface-muted"
      >
        <span aria-hidden="true" className="text-lg leading-none">
          ⋯
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-48 rounded-none border-line"
      >
        <DropdownMenuGroup>
          {items.map((child, i) => (
            <DropdownMenuItem key={i} asChild className="rounded-none">
              {child}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
