/** Must stay aligned with `ALLOWED_URLS` in `src-tauri/src/security.rs`. */
export const ALLOWED_DOC_URL_PREFIXES = [
  "https://nodejs.org/",
  "https://docs.npmjs.com/",
  "https://pnpm.io/",
  "https://git-scm.com/",
  "https://github.com/hulk-pham/Dev-Doctor/releases",
] as const;

export function isAllowedDocUrl(url: string): boolean {
  const trimmed = url.trim();
  return ALLOWED_DOC_URL_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}
