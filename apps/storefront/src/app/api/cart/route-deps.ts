import 'server-only';
import {
  getCart as apiGetCart,
  addItem as apiAddItem,
  setItemQuantity as apiSetQuantity,
  removeItem as apiRemoveItem,
  clearCart as apiClearCart,
  liveCartDeps,
} from '@/lib/api-cart';
import type { CartRouteDeps } from './handlers';

/** Production wiring: each op resolves cookie-bound cart deps, then calls the API. */
export function liveCartRouteDeps(): CartRouteDeps {
  return {
    getCart: async () => apiGetCart(await liveCartDeps()),
    addItem: async (productId, quantity) => apiAddItem(productId, quantity, await liveCartDeps()),
    setItemQuantity: async (productId, quantity) => apiSetQuantity(productId, quantity, await liveCartDeps()),
    removeItem: async (productId) => apiRemoveItem(productId, await liveCartDeps()),
    clearCart: async () => apiClearCart(await liveCartDeps()),
  };
}
