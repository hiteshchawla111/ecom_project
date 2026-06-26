import { ApiAuthError } from '@/lib/api-auth';
import type {
  RegisterSellerInput,
  SellerView,
  UpdateSellerInput,
} from '@/lib/seller';

export interface SellerHandlerResult {
  status: number;
  body: unknown;
}

/** Injectable deps so handlers are unit-testable without Next/cookies. */
export interface SellerRouteDeps {
  register(input: RegisterSellerInput): Promise<SellerView>;
  getMe(): Promise<SellerView>;
  update(input: UpdateSellerInput): Promise<SellerView>;
  /** Mint a new token pair (carrying the fresh role) and persist it. */
  refreshSession(): Promise<void>;
}

function badRequest(message: string): SellerHandlerResult {
  return { status: 400, body: { message } };
}

function fromApiError(err: unknown): SellerHandlerResult {
  if (err instanceof ApiAuthError) {
    return { status: err.status, body: { message: err.message } };
  }
  throw err;
}

export async function handleSellerRegister(
  input: Partial<RegisterSellerInput>,
  deps: SellerRouteDeps,
): Promise<SellerHandlerResult> {
  const displayName = input.displayName?.trim() ?? '';
  if (!displayName) return badRequest('A shop display name is required.');

  const payload: RegisterSellerInput = { displayName };
  if (input.description?.trim()) payload.description = input.description.trim();
  if (input.logoUrl?.trim()) payload.logoUrl = input.logoUrl.trim();

  try {
    await deps.register(payload);
  } catch (err) {
    return fromApiError(err);
  }

  // Registration succeeded — the DB role is now SELLER but the caller's token
  // still says CUSTOMER. Refresh to pick up the new claim. A refresh failure
  // must NOT undo a successful registration.
  try {
    await deps.refreshSession();
  } catch {
    return { status: 201, body: { ok: true, reauth: true } };
  }
  return { status: 201, body: { ok: true } };
}

export async function handleGetSellerMe(
  deps: SellerRouteDeps,
): Promise<SellerHandlerResult> {
  try {
    const view = await deps.getMe();
    return { status: 200, body: view };
  } catch (err) {
    return fromApiError(err);
  }
}

const KYC_AND_PROFILE_FIELDS: (keyof UpdateSellerInput)[] = [
  'displayName',
  'description',
  'logoUrl',
  'gstin',
  'pan',
  'bankAccountNo',
  'bankIfsc',
];

export async function handleSellerUpdate(
  input: UpdateSellerInput,
  deps: SellerRouteDeps,
): Promise<SellerHandlerResult> {
  // Omit empty/absent fields so a blank submit never clears stored KYC.
  const payload: UpdateSellerInput = {};
  for (const key of KYC_AND_PROFILE_FIELDS) {
    const value = input[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      payload[key] = value.trim();
    }
  }
  try {
    const view = await deps.update(payload);
    return { status: 200, body: view };
  } catch (err) {
    return fromApiError(err);
  }
}
