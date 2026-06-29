import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  flattenCategories,
  listCategories,
  type CategoryOption,
} from '../lib/categories';
import {
  getProduct,
  updateProduct,
  type Product,
  type UpdateProductInput,
} from '../lib/products';
import { ProductForm } from '../components/products/ProductForm';

export function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      try {
        const [prod, tree] = await Promise.all([
          getProduct(id!),
          listCategories(),
        ]);
        if (cancelled) return;
        setProduct(prod);
        setCategories(flattenCategories(tree));
      } catch {
        if (!cancelled) setLoadError('Could not load this product.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onSubmit(payload: UpdateProductInput) {
    if (!id) return;
    await updateProduct(id, payload);
    navigate('/products');
  }

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link
          to="/products"
          className="w-fit text-[0.7rem] font-medium uppercase tracking-[0.14em] text-content-muted transition-colors hover:text-content"
        >
          ← Back to products
        </Link>
        <h2 className="font-serif text-3xl font-medium tracking-tight text-content">
          Edit product
        </h2>
      </header>

      {loading ? (
        <p role="status" aria-live="polite" className="text-content-muted">
          Loading…
        </p>
      ) : loadError || !product ? (
        <p role="alert" className="text-sm text-error-500">
          {loadError ?? 'Product not found.'}
        </p>
      ) : (
        <ProductForm
          mode="edit"
          categories={categories}
          initial={product}
          onSubmit={(p) => onSubmit(p as UpdateProductInput)}
        />
      )}
    </section>
  );
}
