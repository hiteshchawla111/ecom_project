/** One failed row in a bulk import, with a human-readable reason. */
export interface RowError {
  /** 1-based data row number (excludes the header row). */
  row: number;
  /** The row's SKU if it was parseable (helps the seller locate it). */
  sku?: string;
  message: string;
}

/** Result of a bulk product import: partial success + per-row errors. */
export interface ImportResult {
  created: number;
  failed: number;
  productIds: string[];
  errors: RowError[];
}
