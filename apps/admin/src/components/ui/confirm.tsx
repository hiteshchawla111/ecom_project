import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog';

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** Confirm button label (default "Confirm"). */
  confirmLabel?: string;
  /** Cancel button label (default "Cancel"). */
  cancelLabel?: string;
  /** Style the confirm action as destructive (red). */
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Promise-based confirmation via a shadcn AlertDialog — replaces native
 * window.confirm() so destructive actions get a styled, accessible, on-brand
 * dialog. Usage: `const confirm = useConfirm(); if (!(await confirm({…}))) return;`
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function settle(value: boolean) {
    setOpen(false);
    resolver.current?.(value);
    resolver.current = null;
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          // Closing via overlay/Escape resolves false.
          if (!next) settle(false);
        }}
      >
        <AlertDialogContent className="rounded-none border border-line bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl font-medium text-content">
              {opts?.title}
            </AlertDialogTitle>
            {opts?.description && (
              <AlertDialogDescription className="text-content-muted">
                {opts.description}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => settle(false)}
              className="rounded-none border border-line bg-surface px-6 text-xs font-medium uppercase tracking-[0.12em] text-content hover:border-content hover:bg-surface-muted"
            >
              {opts?.cancelLabel ?? 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={
                opts?.destructive
                  ? 'rounded-none px-6 text-xs font-medium uppercase tracking-[0.12em] !bg-error-500 !text-white hover:!bg-error-600'
                  : 'rounded-none px-6 text-xs font-medium uppercase tracking-[0.12em] !bg-primary-600 !text-white hover:!bg-primary-700'
              }
            >
              {opts?.confirmLabel ?? 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

/** Access the promise-based confirm function. Must be inside ConfirmProvider. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}
