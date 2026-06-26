import { ApiAuthError } from './api-auth';

export type SellerStatus =
  | 'PENDING_REVIEW'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'DEACTIVATED';

export interface SellerView {
  id: string;
  displayName: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  status: SellerStatus;
  kycVerifiedAt: string | null;
  bankAccountLast4: string | null;
  gstinPresent: boolean;
  panPresent: boolean;
  bankIfscPresent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterSellerInput {
  displayName: string;
  description?: string;
  logoUrl?: string;
}

export interface UpdateSellerInput {
  displayName?: string;
  description?: string;
  logoUrl?: string;
  gstin?: string;
  pan?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
}

export const KYC_PATTERNS = {
  gstin: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  bankAccountNo: /^[0-9]{9,18}$/,
  bankIfsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
} as const;

const KYC_MESSAGES: Record<keyof typeof KYC_PATTERNS, string> = {
  gstin: 'Enter a valid 15-character GSTIN.',
  pan: 'Enter a valid 10-character PAN.',
  bankAccountNo: 'Account number must be 9–18 digits.',
  bankIfsc: 'Enter a valid 11-character IFSC.',
};

/** Validate only the KYC fields that are present and non-empty. */
export function validateKyc(input: UpdateSellerInput): Record<string, string> {
  const errors: Record<string, string> = {};
  (Object.keys(KYC_PATTERNS) as (keyof typeof KYC_PATTERNS)[]).forEach((key) => {
    const value = input[key];
    if (typeof value === 'string' && value.length > 0 && !KYC_PATTERNS[key].test(value)) {
      errors[key] = KYC_MESSAGES[key];
    }
  });
  return errors;
}

interface SellerApiOptions {
  baseUrl: string;
  accessToken: string;
  fetch?: typeof fetch;
}

interface ApiErrorBody {
  message?: string | string[];
  error?: string;
}

function messageFrom(body: unknown, status: number): string {
  const b = body as ApiErrorBody | null;
  if (b && Array.isArray(b.message)) return b.message.join(', ');
  if (b && typeof b.message === 'string') return b.message;
  if (b && typeof b.error === 'string') return b.error;
  return `Request failed with status ${status}`;
}

async function sellerRequest<T>(
  path: string,
  init: RequestInit,
  opts: SellerApiOptions,
): Promise<T> {
  const fetchImpl = opts.fetch ?? fetch;
  const res = await fetchImpl(`${opts.baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${opts.accessToken}`,
      ...init.headers,
    },
  });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new ApiAuthError(messageFrom(body, res.status), res.status);
  return body as T;
}

export function registerSeller(
  input: RegisterSellerInput,
  opts: SellerApiOptions,
): Promise<SellerView> {
  return sellerRequest<SellerView>(
    '/seller/register',
    { method: 'POST', body: JSON.stringify(input) },
    opts,
  );
}

export function getSellerMe(opts: SellerApiOptions): Promise<SellerView> {
  return sellerRequest<SellerView>('/seller/me', { method: 'GET' }, opts);
}

export function updateSellerMe(
  input: UpdateSellerInput,
  opts: SellerApiOptions,
): Promise<SellerView> {
  return sellerRequest<SellerView>(
    '/seller/me',
    { method: 'PATCH', body: JSON.stringify(input) },
    opts,
  );
}
