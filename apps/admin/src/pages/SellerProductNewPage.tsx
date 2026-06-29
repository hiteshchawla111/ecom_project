import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  flattenCategories,
  listCategories,
  type CategoryOption,
} from '../lib/categories';
import type { CreateProductInput } from '../lib/products';
import { createSellerProduct } from '../lib/sellerProducts';
import { ProductForm } from '../components/products/ProductForm';

export function SellerProductNewPage() {
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
    await createSellerProduct(payload);
    navigate('/seller/products');
  }

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link
          to="/seller/products"
          className="w-fit text-[0.7rem] font-medium uppercase tracking-[0.14em] text-content-muted transition-colors hover:text-content"
        >
          ← Back to products
        </Link>
        <h2 className="font-serif text-3xl font-medium tracking-tight text-content">
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
