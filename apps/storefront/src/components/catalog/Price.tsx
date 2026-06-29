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
        <span className="font-medium tabular-nums text-content">
          {formatPrice(price)}
        </span>
      </span>
    );
  }

  return (
    <span className={className}>
      <span className="font-medium tabular-nums text-content">
        {formatPrice(salePrice)}
      </span>{' '}
      <del className="tabular-nums text-content-subtle">{formatPrice(price)}</del>{' '}
      <span className="text-xs font-medium uppercase tracking-wide text-accent-600">
        Sale
      </span>
    </span>
  );
}
