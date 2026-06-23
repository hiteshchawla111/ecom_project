import { useEffect, useState } from 'react';
import type { InventoryReport } from '../lib/inventory';

interface ReportState {
  report: InventoryReport | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch an inventory report once on mount, cancellation-guarded so a slow stale
 * response can't clobber a newer state. The `fetcher` is injected so the same
 * hook backs both the admin (cross-seller) and seller (scoped) report pages.
 */
export function useInventoryReport(
  fetcher: () => Promise<InventoryReport>,
): ReportState {
  const [report, setReport] = useState<InventoryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetcher();
        if (cancelled) return;
        setReport(res);
        setError(null);
      } catch {
        if (!cancelled) setError('Could not load the report. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // The fetcher is a stable module-level function; intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { report, loading, error };
}
