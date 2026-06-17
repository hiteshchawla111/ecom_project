import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  flattenCategories,
  listCategories,
  type CategoryOption,
} from '../lib/categories';
import { createProduct, type CreateProductInput } from '../lib/products';
import { ProductForm } from '../components/products/ProductForm';

export function ProductNewPage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const tree = await listCategories();
        if (!cancelled) setCategories(flattenCategories(tree));
      } catch {
        if (!cancelled) setLoadError('Could not load categories.');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(payload: CreateProductInput) {
    await createProduct(payload);
    navigate('/products');
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link
          to="/products"
          className="w-fit text-sm font-medium text-primary-700 hover:underline"
        >
          ← Back to products
        </Link>
        <h2 className="font-heading text-2xl font-semibold text-neutral-900">
          New product
        </h2>
      </header>

      {loadError && (
        <p role="alert" className="text-sm text-error-500">
          {loadError}
        </p>
      )}

      <ProductForm
        mode="create"
        categories={categories}
        onSubmit={(p) => onSubmit(p as CreateProductInput)}
      />
    </section>
  );
}
