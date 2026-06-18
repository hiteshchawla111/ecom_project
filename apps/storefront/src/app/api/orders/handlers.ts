import { ApiAuthError } from '@/lib/api-auth';
import type { CheckoutInput, OrderView } from '@/lib/api-orders';

export interface OrderHandlerResult {
  status: number;
  body: unknown;
}

/** Injectable order operations so handlers are testable without cookies/Next. */
export interface OrdersRouteDeps {
  placeOrder(input: CheckoutInput): Promise<OrderView>;
}

function badRequest(message: string): OrderHandlerResult {
  return { status: 400, body: { message } };
}

/** Map an upstream API error to a client result; rethrow the unexpected. */
function fromApiError(err: unknown): OrderHandlerResult {
  if (err instanceof ApiAuthError) {
    return { status: err.status, body: { message: err.message } };
  }
  throw err;
}

/** Required (non-optional) shipping fields. shipLine2 is optional. */
const REQUIRED: (keyof CheckoutInput)[] = [
  'shipFullName',
  'shipLine1',
  'shipCity',
  'shipState',
  'shipCountry',
  'shipPostalCode',
];

export async function handlePlaceOrder(
  input: Partial<CheckoutInput>,
  deps: OrdersRouteDeps,
): Promise<OrderHandlerResult> {
  for (const key of REQUIRED) {
    const value = input[key];
    if (typeof value !== 'string' || value.trim() === '') {
      return badRequest(`${key} is required.`);
    }
  }
  try {
    const order = await deps.placeOrder({
      shipFullName: input.shipFullName!,
      shipLine1: input.shipLine1!,
      shipLine2: input.shipLine2,
      shipCity: input.shipCity!,
      shipState: input.shipState!,
      shipCountry: input.shipCountry!,
      shipPostalCode: input.shipPostalCode!,
    });
    return { status: 201, body: order };
  } catch (err) {
    return fromApiError(err);
  }
}
