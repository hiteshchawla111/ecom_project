import 'server-only';
import { apiBaseUrl } from './env';

/** Default coral hue (matches the API default + DESIGN.md primary-500). */
export const DEFAULT_BRAND_HUE = 28;

export interface Branding {
  hue: number;
}

/**
 * Fetch the admin-configured brand hue from the public settings endpoint.
 * Server-side only (root layout) so <html style="--brand-hue"> is set before
 * paint — no flash. Never throws: any failure falls back to the coral default,
 * so a settings outage can't break the whole site.
 */
export async function getBrandHue(
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  try {
    const res = await fetchImpl(`${apiBaseUrl()}/settings/branding`, {
      cache: 'no-store',
    });
    if (!res.ok) return DEFAULT_BRAND_HUE;
    const body = (await res.json()) as Partial<Branding>;
    return typeof body.hue === 'number' && Number.isFinite(body.hue)
      ? body.hue
      : DEFAULT_BRAND_HUE;
  } catch {
    return DEFAULT_BRAND_HUE;
  }
}
