import { formatPrice, isOnSale } from '@/lib/money';

interface PriceProps {
  price: string;
  salePrice: string | null;
  className?: string;
}

/**
 * Renders a product price. On sale, shows the sale price prominently with the
 * original struck through and a textual "Sale" cue (DESIGN.md: never rely on
 * color alone). Display-only — all values come from the API.
 */
export function Price({ price, salePrice, className }: PriceProps) {
  const onSale = isOnSale(price, salePrice);

  if (!onSale || salePrice === null) {
    return (
      <span className={className}>
        <span className="font-bold text-neutral-900">{formatPrice(price)}</span>
      </span>
    );
  }

  return (
    <span className={className}>
      <span className="font-bold text-accent-600">{formatPrice(salePrice)}</span>{' '}
      <del className="text-neutral-400">{formatPrice(price)}</del>{' '}
      <span className="rounded-full bg-accent-400/20 px-2 py-0.5 text-xs font-medium text-accent-600">
        Sale
      </span>
    </span>
  );
}
