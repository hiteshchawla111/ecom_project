/** Base URL of the API. Configurable via VITE_API_URL; defaults to the dev port. */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_URL ?? 'http://localhost:5000';
