import { ConfigService } from '@nestjs/config';
import { TotalsConfig } from './totals';

const DEFAULT_TAX_RATE = 0.1;
const DEFAULT_SHIPPING_FLAT = 5.0;
const DEFAULT_FREE_SHIPPING_THRESHOLD = 50.0;

/** Parse a currency-unit string (e.g. "5.00") to integer cents, half-up. */
function toCents(value: number): number {
  return Math.round(value * 100);
}

/**
 * Resolve the cart pricing rules from env (with safe defaults) into the
 * integer-cents `TotalsConfig` the pure pipeline expects.
 */
export function resolveTotalsConfig(config: ConfigService): TotalsConfig {
  const taxRate = Number(config.get('TAX_RATE') ?? DEFAULT_TAX_RATE);
  const shippingFlat = Number(
    config.get('SHIPPING_FLAT') ?? DEFAULT_SHIPPING_FLAT,
  );
  const freeShippingThreshold = Number(
    config.get('FREE_SHIPPING_THRESHOLD') ?? DEFAULT_FREE_SHIPPING_THRESHOLD,
  );

  return {
    taxRate,
    shippingFlatCents: toCents(shippingFlat),
    freeShippingThresholdCents: toCents(freeShippingThreshold),
  };
}
