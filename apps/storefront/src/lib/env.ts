/** Server-side base URL of the NestJS API (`apps/api`). */
export function apiBaseUrl(): string {
  return process.env.API_URL ?? 'http://localhost:3001';
}
