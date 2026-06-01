/**
 * In-memory access token holder.
 *
 * The token is intentionally NOT stored in localStorage or sessionStorage —
 * keeping it only in RAM means XSS scripts cannot read it via storage APIs.
 * The refresh token lives in an httpOnly cookie and is never accessible to JS.
 *
 * api.ts reads from here; auth.store.ts writes here.
 * This module breaks what would otherwise be a circular import between the two.
 */

let _accessToken: string | null = null;

export function getAccessToken(): string | null {
  return _accessToken;
}

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}
