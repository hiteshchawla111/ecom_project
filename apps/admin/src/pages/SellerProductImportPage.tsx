import { useState } from 'react';
import { Link } from 'react-router-dom';
import { importSellerProducts, type ImportResult } from '../lib/sellerProducts';

export function SellerProductImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const res = await importSellerProducts(file);
      setResult(res);
    } catch {
      setError('The upload could not be completed. Check the file and try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link
          to="/seller/products"
          className="w-fit text-sm font-medium text-primary-700 hover:underline"
        >
          ← Back to products
        </Link>
        <h2 className="font-heading text-2xl font-semibold text-content">
          Import products from CSV
        </h2>
        <p className="text-sm text-content-muted">
          Columns: name, sku, description, price, categoryId (optional: salePrice, brand, status).
        </p>
      </header>

      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <label htmlFor="csv-file" className="text-sm font-medium text-content">
          CSV file
        </label>
        <input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setError(null);
          }}
          className="text-sm text-content-muted"
        />
        <div>
          <button
            type="button"
            disabled={!file || uploading}
            onClick={() => void onUpload()}
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md bg-error-500/10 px-4 py-3 text-sm text-error-500"
        >
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-content">
            <span className="font-medium text-success-500">{result.created} created</span>
            {', '}
            <span
              className={
                result.failed > 0
                  ? 'font-medium text-error-500'
                  : 'text-content-muted'
              }
            >
              {result.failed} failed
            </span>
            .
          </p>
          {result.errors.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-muted text-content-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Row
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      SKU
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Problem
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr
                      key={`${e.row}-${e.sku ?? ''}-${i}`}
                      className="border-t border-line text-content"
                    >
                      <td className="px-4 py-2">{e.row}</td>
                      <td className="px-4 py-2 text-content-muted">{e.sku ?? '—'}</td>
                      <td className="px-4 py-2">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
