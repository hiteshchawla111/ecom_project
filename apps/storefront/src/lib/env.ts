/** Server-side base URL of the NestJS API (`apps/api`). Dev API runs on :5000. */
export function apiBaseUrl(): string {
  return process.env.API_URL ?? 'http://localhost:5000';
}
