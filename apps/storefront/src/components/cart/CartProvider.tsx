'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CartView } from '@/lib/api-cart';

export interface CartContextValue {
  cart: CartView | null;
  itemCount: number;
  pending: boolean;
  error: string | null;
  add(productId: string, quantity?: number): Promise<void>;
  setQuantity(productId: string, quantity: number): Promise<void>;
  remove(productId: string): Promise<void>;
  clear(): Promise<void>;
  hydrate(cart: CartView): void;
}

export const CartContext = createContext<CartContextValue | null>(null);

interface ErrorBody {
  message?: string;
}

export function CartProvider({
  initialCart,
  children,
}: {
  initialCart: CartView | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [cart, setCart] = useState<CartView | null>(initialCart);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (endpoint: string, init: RequestInit) => {
      setPending(true);
      setError(null);
      try {
        const res = await fetch(endpoint, {
          ...init,
          headers: { 'content-type': 'application/json', ...init.headers },
        });
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        const body = (await res.json().catch(() => null)) as CartView | ErrorBody | null;
        if (!res.ok) {
          setError((body as ErrorBody)?.message ?? 'Unable to update cart.');
          return;
        }
        setCart(body as CartView);
      } catch {
        setError('Unable to reach the server. Please try again.');
      } finally {
        setPending(false);
      }
    },
    [router],
  );

  const value = useMemo<CartContextValue>(() => {
    const itemCount = cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;
    return {
      cart,
      itemCount,
      pending,
      error,
      add: (productId, quantity = 1) =>
        run('/api/cart/items', { method: 'POST', body: JSON.stringify({ productId, quantity }) }),
      setQuantity: (productId, quantity) =>
        run(`/api/cart/items/${encodeURIComponent(productId)}`, { method: 'PATCH', body: JSON.stringify({ quantity }) }),
      remove: (productId) =>
        run(`/api/cart/items/${encodeURIComponent(productId)}`, { method: 'DELETE' }),
      clear: () => run('/api/cart', { method: 'DELETE' }),
      hydrate: (next) => setCart(next),
    };
  }, [cart, pending, error, run]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
