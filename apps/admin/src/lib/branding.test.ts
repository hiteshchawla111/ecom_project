import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const request = vi.fn();
vi.mock('./apiClient', () => ({
  apiClient: { request: (...a: unknown[]) => request(...a) },
}));

import { getBranding, updateBranding, applyBrandHue } from './branding';

beforeEach(() => request.mockReset());
afterEach(() => document.documentElement.removeAttribute('style'));

describe('branding lib', () => {
  it('getBranding calls the public endpoint', async () => {
    request.mockResolvedValue({ hue: 210 });
    await expect(getBranding()).resolves.toEqual({ hue: 210 });
    expect(request).toHaveBeenCalledWith('/settings/branding');
  });

  it('updateBranding PUTs the hue', async () => {
    request.mockResolvedValue({ hue: 120 });
    await expect(updateBranding(120)).resolves.toEqual({ hue: 120 });
    expect(request).toHaveBeenCalledWith('/settings/branding', {
      method: 'PUT',
      body: JSON.stringify({ hue: 120 }),
    });
  });

  it('applyBrandHue sets the CSS variable on <html>', () => {
    applyBrandHue(265);
    expect(document.documentElement.style.getPropertyValue('--brand-hue')).toBe(
      '265',
    );
  });
});
