import { getSellerInventoryReport } from '../lib/sellerInventory';
import { InventoryReportCards } from '../components/inventory/InventoryReportCards';
import { useInventoryReport } from './useInventoryReport';

/**
 * Seller inventory report (SELLER). Aggregate stock health and valuation for
 * the acting seller only, sourced from the scoped GET /seller/inventory/reports.
 */
export function SellerInventoryReportPage() {
  const { report, loading, error } = useInventoryReport(
    getSellerInventoryReport,
  );

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h2 className="font-serif text-3xl font-medium tracking-tight text-content">
          Inventory report
        </h2>
        <p className="text-content-muted">
          Stock health and valuation for your products.
        </p>
      </header>

      <InventoryReportCards report={report} loading={loading} error={error} />
    </section>
  );
}
