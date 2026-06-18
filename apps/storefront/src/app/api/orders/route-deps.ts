import 'server-only';
import { placeOrder as apiPlaceOrder } from '@/lib/api-orders';
import { liveAuthedDeps } from '@/lib/api-authed';
import type { OrdersRouteDeps } from './handlers';

export function liveOrdersRouteDeps(): OrdersRouteDeps {
  return {
    placeOrder: async (input) => apiPlaceOrder(input, await liveAuthedDeps()),
  };
}
