import { getInventoryReport } from '../lib/inventory';
import { InventoryReportCards } from '../components/inventory/InventoryReportCards';
import { useInventoryReport } from './useInventoryReport';

/**
 * Cross-seller inventory report (ADMIN / INVENTORY_MANAGER). Aggregate stock
 * health and valuation across all sellers, sourced from GET /inventory/reports.
 */
export function InventoryReportPage() {
  const { report, loading, error } = useInventoryReport(getInventoryReport);

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h2 className="font-serif text-3xl font-medium tracking-tight text-content">
          Inventory report
        </h2>
        <p className="text-content-muted">
          Stock health and valuation across all sellers.
        </p>
      </header>

      <InventoryReportCards report={report} loading={loading} error={error} />
    </section>
  );
}
