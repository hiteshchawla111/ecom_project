import { getProducts, getCategoryTree } from '@/lib/catalog';
import type { Product, Category } from '@/lib/catalog';
import { ProductCard } from '@/components/catalog/ProductCard';
import { Hero, type HeroShowcaseItem } from '@/components/home/Hero';
import { productImageUrl } from '@/components/catalog/product-image';
import { CategoryShortcuts } from '@/components/home/CategoryShortcuts';
import { ProductRow } from '@/components/home/ProductRow';
import {
  PromoBanner,
  ValueProps,
  NewsletterBand,
} from '@/components/home/HomeBands';
import { Reveal } from '@/components/motion/Reveal';
import Link from 'next/link';

/** Number of newest products to feature on the home page. */
const FEATURED_COUNT = 8;
/** Products per supporting row (deals / best of). */
const ROW_COUNT = 4;
/** Top-level categories to surface as quick shortcuts. */
const SHORTCUT_COUNT = 6;

/**
 * Home page. Builds a full storefront narrative from the public catalog API:
 * newest products (hero collage + bento), the category tree, plus two
 * supporting product rows (deals, premium picks) that reuse the same
 * `getProducts` endpoint with different sort/price params — no new API calls.
 *
 * Every fetch degrades gracefully: if the API is unavailable the page still
 * renders the hero and editorial bands, and data-backed sections hide
 * themselves (each is empty-state aware).
 */
export default async function Home() {
  const [featured, categories, deals, premium] = await Promise.all([
    fetchFeatured(),
    fetchCategories(),
    fetchDeals(),
    fetchPremium(),
  ]);

  const showcase: HeroShowcaseItem[] = featured.slice(0, 3).map((product) => ({
    id: product.id,
    name: product.name,
    imageUrl: productImageUrl(product),
    href: `/products/${product.id}`,
  }));

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-20 px-4 pb-24 pt-6 sm:gap-24">
      <Hero showcase={showcase} />

      {featured.length > 0 && (
        <section className="flex flex-col gap-8">
          <div className="flex items-end justify-between gap-4 border-b border-line pb-5">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">
                {featured.length} just landed
              </span>
              <h2 className="font-heading text-3xl font-extrabold tracking-tight text-content sm:text-4xl">
                New arrivals
              </h2>
            </div>
            <Link
              href="/products?sortBy=createdAt&sortDir=desc"
              className="group hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-content transition-colors hover:text-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 sm:inline-flex"
            >
              See everything
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          {/* Editorial bento: the newest product leads at 2×2, the rest flow. */}
          <Reveal
            stagger
            className="grid auto-rows-[minmax(0,1fr)] grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4"
          >
            {featured.map((product, i) => (
              <div
                key={product.id}
                className={i === 0 ? 'col-span-2 row-span-2' : undefined}
              >
                <ProductCard product={product} featured={i === 0} />
              </div>
            ))}
          </Reveal>
        </section>
      )}

      <Reveal>
        <PromoBanner />
      </Reveal>

      <Reveal>
        <CategoryShortcuts categories={categories.slice(0, SHORTCUT_COUNT)} />
      </Reveal>

      <ProductRow
        eyebrow="Limited time"
        title="On sale now"
        href="/products"
        products={deals}
      />

      <Reveal>
        <ValueProps />
      </Reveal>

      <ProductRow
        eyebrow="Premium picks"
        title="Best of the catalog"
        href="/products?sortBy=price&sortDir=desc"
        products={premium}
      />

      <Reveal>
        <NewsletterBand />
      </Reveal>
    </main>
  );
}

/** Newest active products; empty array if the API is unavailable. */
async function fetchFeatured(): Promise<Product[]> {
  try {
    const { data } = await getProducts({
      sortBy: 'createdAt',
      sortDir: 'desc',
      status: 'ACTIVE',
      pageSize: FEATURED_COUNT,
    });
    return data;
  } catch {
    return [];
  }
}

/** Top-level categories; empty array if the API is unavailable. */
async function fetchCategories(): Promise<Category[]> {
  try {
    return await getCategoryTree();
  } catch {
    return [];
  }
}

/**
 * Products currently on sale. The list endpoint has no "on sale" filter, so we
 * pull active products and keep those with a sale price set client-side. Empty
 * array on failure or when nothing is discounted.
 */
async function fetchDeals(): Promise<Product[]> {
  try {
    const { data } = await getProducts({
      status: 'ACTIVE',
      sortBy: 'createdAt',
      sortDir: 'desc',
      pageSize: 24,
    });
    return data
      .filter((p) => p.salePrice != null && p.salePrice !== '')
      .slice(0, ROW_COUNT);
  } catch {
    return [];
  }
}

/** Highest-priced active products as a "premium picks" row. */
async function fetchPremium(): Promise<Product[]> {
  try {
    const { data } = await getProducts({
      status: 'ACTIVE',
      sortBy: 'price',
      sortDir: 'desc',
      pageSize: ROW_COUNT,
    });
    return data;
  } catch {
    return [];
  }
}
