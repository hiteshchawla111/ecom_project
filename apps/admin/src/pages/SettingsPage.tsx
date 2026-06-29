import { useEffect, useState } from 'react';
import {
  getBranding,
  updateBranding,
  applyBrandHue,
  DEFAULT_BRAND_HUE,
} from '../lib/branding';

/** Preset brand hues for quick selection (label + hue on the color wheel). */
const PRESETS: ReadonlyArray<{ label: string; hue: number }> = [
  { label: 'Coral', hue: 28 },
  { label: 'Rose', hue: 350 },
  { label: 'Indigo', hue: 265 },
  { label: 'Emerald', hue: 155 },
  { label: 'Teal', hue: 200 },
];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Admin Settings — brand color. Picking a hue previews live across the whole
 * admin (applyBrandHue sets --brand-hue, the OKLCH scale re-derives), and Save
 * persists it so both apps pick it up on next load. ADMIN-only via the route.
 */
export function SettingsPage() {
  const [hue, setHue] = useState<number>(DEFAULT_BRAND_HUE);
  const [save, setSave] = useState<SaveState>('idle');

  useEffect(() => {
    let cancelled = false;
    void getBranding()
      .then(({ hue }) => {
        if (!cancelled) setHue(hue);
      })
      .catch(() => {
        /* keep default */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function preview(next: number) {
    setHue(next);
    applyBrandHue(next);
    setSave('idle');
  }

  async function onSave() {
    setSave('saving');
    try {
      await updateBranding(hue);
      applyBrandHue(hue);
      setSave('saved');
    } catch {
      setSave('error');
    }
  }

  return (
    <section className="flex max-w-xl flex-col gap-8">
      <header className="flex flex-col gap-1.5 border-b border-line pb-6">
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-content-subtle">
          System
        </span>
        <h2 className="font-serif text-3xl font-medium tracking-tight text-content">
          Settings
        </h2>
        <p className="text-sm text-content-muted">
          Brand color — applies to the storefront and admin.
        </p>
      </header>

      <div className="flex flex-col gap-5 border border-line bg-surface p-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-12 w-12 rounded-lg bg-primary-500 shadow-sm"
          />
          <div>
            <p className="font-medium text-content">Brand hue</p>
            <p className="text-sm text-content-muted">
              Preview updates instantly. Save to apply everywhere.
            </p>
          </div>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-content">
            Brand hue ({hue}°)
          </span>
          <input
            type="range"
            min={0}
            max={360}
            value={hue}
            aria-label="Brand hue"
            onChange={(e) => preview(Number(e.target.value))}
            className="accent-primary-500"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.hue}
              type="button"
              onClick={() => preview(p.hue)}
              aria-pressed={hue === p.hue}
              className={`rounded-full border px-3 py-1 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 ${
                hue === p.hue
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-line text-content-muted hover:bg-surface-muted'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={save === 'saving'}
            className="bg-primary-600 px-6 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors duration-300 hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-50"
          >
            {save === 'saving' ? 'Saving…' : 'Save'}
          </button>
          {save === 'saved' && (
            <span role="status" className="text-sm text-success-500">
              Saved
            </span>
          )}
          {save === 'error' && (
            <span role="alert" className="text-sm text-error-500">
              Could not save. Please try again.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
