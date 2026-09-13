import { setAuthTokenGetter } from '@workspace/api-client-react';

// Admin session token issued by POST /api/admin/login. The server verifies it on
// every admin request; this module only stores it for the browser tab.
const TOKEN_KEY = 'arya_admin_token';
const EXPIRES_KEY = 'arya_admin_token_expires_at';
const LEGACY_FLAG_KEY = 'arya_admin_access';
export const ADMIN_LOGOUT_EVENT = 'arya:admin-logout';

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function getAdminToken(): string | null {
  const store = storage();
  if (!store) return null;
  const token = store.getItem(TOKEN_KEY);
  const expiresAt = Number(store.getItem(EXPIRES_KEY));
  if (!token || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    if (token) clearAdminToken();
    return null;
  }
  return token;
}

export function setAdminToken(token: string, expiresAt: number): void {
  const store = storage();
  if (!store) return;
  store.setItem(TOKEN_KEY, token);
  store.setItem(EXPIRES_KEY, String(expiresAt));
}

export function clearAdminToken(): void {
  const store = storage();
  store?.removeItem(TOKEN_KEY);
  store?.removeItem(EXPIRES_KEY);
}

/** Clears the token and tells the app to show the login screen. */
export function handleAdminUnauthorized(): void {
  clearAdminToken();
  window.dispatchEvent(new Event(ADMIN_LOGOUT_EVENT));
}

export function isUnauthorizedError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 401;
}

export function initAdminAuth(): void {
  // The old client-side-only flag grants nothing any more; drop it.
  storage()?.removeItem(LEGACY_FLAG_KEY);
  // Attach the admin bearer token (when present) to API calls made by the generated client.
  setAuthTokenGetter(() => getAdminToken());
}
