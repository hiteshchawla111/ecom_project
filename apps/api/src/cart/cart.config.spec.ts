import { resolveTotalsConfig } from './cart.config';

/** Minimal ConfigService stand-in: get(key) -> value from a map. */
const makeConfig = (values: Record<string, string>) => ({
  get: (key: string) => values[key],
});

describe('resolveTotalsConfig', () => {
  it('uses defaults when env vars are absent', () => {
    const cfg = resolveTotalsConfig(makeConfig({}) as never);
    expect(cfg).toEqual({
      taxRate: 0.1,
      shippingFlatCents: 500,
      freeShippingThresholdCents: 5000,
    });
  });

  it('parses provided values and converts money to integer cents', () => {
    const cfg = resolveTotalsConfig(
      makeConfig({
        TAX_RATE: '0.2',
        SHIPPING_FLAT: '7.50',
        FREE_SHIPPING_THRESHOLD: '100',
      }) as never,
    );
    expect(cfg).toEqual({
      taxRate: 0.2,
      shippingFlatCents: 750,
      freeShippingThresholdCents: 10000,
    });
  });
});
