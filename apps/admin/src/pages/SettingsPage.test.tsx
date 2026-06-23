import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getBranding = vi.fn();
const updateBranding = vi.fn();
const applyBrandHue = vi.fn();
vi.mock('../lib/branding', () => ({
  getBranding: () => getBranding(),
  updateBranding: (hue: number) => updateBranding(hue),
  applyBrandHue: (hue: number) => applyBrandHue(hue),
  DEFAULT_BRAND_HUE: 28,
}));

import { SettingsPage } from './SettingsPage';

beforeEach(() => {
  getBranding.mockReset().mockResolvedValue({ hue: 28 });
  updateBranding.mockReset().mockResolvedValue({ hue: 210 });
  applyBrandHue.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('SettingsPage', () => {
  it('loads and shows the current brand hue', async () => {
    render(<SettingsPage />);
    const slider = (await screen.findByLabelText(/brand hue/i)) as HTMLInputElement;
    expect(slider.value).toBe('28');
  });

  it('previews live as the hue changes (before saving)', async () => {
    render(<SettingsPage />);
    const slider = (await screen.findByLabelText(/brand hue/i)) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '210' } });
    await waitFor(() => expect(applyBrandHue).toHaveBeenCalledWith(210));
  });

  it('saves the chosen hue', async () => {
    render(<SettingsPage />);
    const slider = (await screen.findByLabelText(/brand hue/i)) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '120' } });

    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(updateBranding).toHaveBeenCalledWith(120));
  });

  it('shows a confirmation after saving', async () => {
    render(<SettingsPage />);
    await screen.findByLabelText(/brand hue/i);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
  });
});
