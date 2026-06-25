import { apiClient } from './apiClient';

/** Default coral hue (matches the API default + DESIGN.md primary-500). */
export const DEFAULT_BRAND_HUE = 28;

export interface Branding {
  hue: number;
}

/** Fetch the current brand hue (public endpoint). */
export function getBranding(): Promise<Branding> {
  return apiClient.request<Branding>('/settings/branding');
}

/** Persist a new brand hue (ADMIN-only). */
export function updateBranding(hue: number): Promise<Branding> {
  return apiClient.request<Branding>('/settings/branding', {
    method: 'PUT',
    body: JSON.stringify({ hue }),
  });
}

/** Reflect a hue onto <html style="--brand-hue"> so the OKLCH scale re-themes. */
export function applyBrandHue(hue: number): void {
  document.documentElement.style.setProperty('--brand-hue', String(hue));
}
