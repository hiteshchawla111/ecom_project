import { describe, expect, it, vi } from 'vitest';
import { getBrandHue, DEFAULT_BRAND_HUE } from './branding';

const okJson = (body: unknown): Response =>
  ({ ok: true, json: async () => body }) as Response;

describe('getBrandHue', () => {
  it('returns the hue from the settings endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ hue: 210 }));
    await expect(getBrandHue(fetchImpl)).resolves.toBe(210);
  });

  it('falls back to the default when the response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false } as Response);
    await expect(getBrandHue(fetchImpl)).resolves.toBe(DEFAULT_BRAND_HUE);
  });

  it('falls back to the default when the body has no numeric hue', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ hue: 'red' }));
    await expect(getBrandHue(fetchImpl)).resolves.toBe(DEFAULT_BRAND_HUE);
  });

  it('falls back to the default when the fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network'));
    await expect(getBrandHue(fetchImpl)).resolves.toBe(DEFAULT_BRAND_HUE);
  });
});
