import { useState, type FormEvent } from 'react';
import type { CategoryOption } from '../../lib/categories';
import type {
  CreateProductInput,
  Product,
  UpdateProductInput,
} from '../../lib/products';

type Mode = 'create' | 'edit';

interface ProductFormProps {
  mode: Mode;
  categories: CategoryOption[];
  initial?: Product;
  /** Receives the validated payload; the page wires this to create/update. */
  onSubmit: (payload: CreateProductInput | UpdateProductInput) => Promise<void>;
}

interface FieldState {
  name: string;
  sku: string;
  description: string;
  price: string;
  salePrice: string;
  brand: string;
  categoryId: string;
}

type Errors = Partial<Record<keyof FieldState, string>>;

function initialState(initial?: Product): FieldState {
  return {
    name: initial?.name ?? '',
    sku: initial?.sku ?? '',
    description: initial?.description ?? '',
    price: initial?.price ?? '',
    salePrice: initial?.salePrice ?? '',
    brand: initial?.brand ?? '',
    categoryId: initial?.categoryId ?? '',
  };
}

function validate(s: FieldState, mode: Mode): Errors {
  const errors: Errors = {};
  if (!s.name.trim()) errors.name = 'Name is required.';
  if (mode === 'create' && !s.sku.trim()) errors.sku = 'SKU is required.';
  if (!s.description.trim()) errors.description = 'Description is required.';
  const price = Number(s.price);
  if (!s.price || !Number.isFinite(price) || price <= 0) {
    errors.price = 'Enter a price greater than 0.';
  }
  if (s.salePrice) {
    const sale = Number(s.salePrice);
    if (!Number.isFinite(sale) || sale <= 0) {
      errors.salePrice = 'Sale price must be greater than 0.';
    } else if (Number.isFinite(price) && sale >= price) {
      errors.salePrice = 'Sale price must be below the regular price.';
    }
  }
  if (!s.categoryId) errors.categoryId = 'Choose a category.';
  return errors;
}

export function ProductForm({
  mode,
  categories,
  initial,
  onSubmit,
}: ProductFormProps) {
  const [fields, setFields] = useState<FieldState>(() => initialState(initial));
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof FieldState>(key: K, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function buildPayload(): CreateProductInput | UpdateProductInput {
    const base = {
      name: fields.name.trim(),
      description: fields.description.trim(),
      price: Number(fields.price),
      salePrice: fields.salePrice ? Number(fields.salePrice) : undefined,
      brand: fields.brand.trim() || undefined,
      categoryId: fields.categoryId,
    };
    return mode === 'create' ? { ...base, sku: fields.sku.trim() } : base;
  }

  async function onFormSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const found = validate(fields, mode);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit(buildPayload());
    } catch {
      setSubmitError('Could not save the product. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onFormSubmit} className="flex max-w-xl flex-col gap-4" noValidate>
      {submitError && (
        <p
          role="alert"
          className="rounded-md bg-error-500/10 px-4 py-3 text-sm text-error-500"
        >
          {submitError}
        </p>
      )}

      <Field id="name" label="Name" error={errors.name}>
        <input
          id="name"
          value={fields.name}
          onChange={(e) => set('name', e.target.value)}
          className={inputClass}
        />
      </Field>

      {mode === 'create' && (
        <Field id="sku" label="SKU" error={errors.sku}>
          <input
            id="sku"
            value={fields.sku}
            onChange={(e) => set('sku', e.target.value)}
            className={inputClass}
          />
        </Field>
      )}

      <Field id="description" label="Description" error={errors.description}>
        <textarea
          id="description"
          rows={3}
          value={fields.description}
          onChange={(e) => set('description', e.target.value)}
          className={inputClass}
        />
      </Field>

      <div className="flex gap-4">
        <Field id="price" label="Price" error={errors.price}>
          <input
            id="price"
            type="number"
            min={0}
            step="0.01"
            value={fields.price}
            onChange={(e) => set('price', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field id="salePrice" label="Sale price (optional)" error={errors.salePrice}>
          <input
            id="salePrice"
            type="number"
            min={0}
            step="0.01"
            value={fields.salePrice}
            onChange={(e) => set('salePrice', e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field id="brand" label="Brand (optional)">
        <input
          id="brand"
          value={fields.brand}
          onChange={(e) => set('brand', e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field id="category" label="Category" error={errors.categoryId}>
        <select
          id="category"
          value={fields.categoryId}
          onChange={(e) => set('categoryId', e.target.value)}
          className={inputClass}
        >
          <option value="">Select a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>

      <div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-50"
        >
          {mode === 'create' ? 'Create product' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  'w-full rounded-md border border-line px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500';

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-content">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-error-500">{error}</p>}
    </div>
  );
}
