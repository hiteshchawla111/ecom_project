import 'server-only';
import { suggestProducts } from '@/lib/catalog';
import type { SuggestRouteDeps } from './handlers';

/** Production wiring: proxy to the API with the server-only base URL. */
export function liveSuggestRouteDeps(): SuggestRouteDeps {
  return {
    suggest: (query) => suggestProducts(query, { baseUrl: process.env.API_URL as string }),
  };
}
