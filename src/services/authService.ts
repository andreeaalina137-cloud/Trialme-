import { safeStorageGet, safeStorageSet, safeStorageRemove } from '../utils/storage';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
}

const SESSION_STORAGE_KEY = 'monetry_user_session';
const RETURN_TO_STORAGE_KEY = 'monetry_auth_return_to';

type AuthListener = (user: AuthUser | null) => void;
const authListeners = new Set<AuthListener>();

export function sanitizeReturnToUrl(url: string | null | undefined, fallback = '/'): string {
  if (!url || typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  if (!trimmed) return fallback;

  // Reject CRLF, null bytes, backslashes, control characters
  if (/[\r\n\0\\]/.test(trimmed)) return fallback;

  // Reject protocol specifications (http:, https:, javascript:, data:, vbscript:, file:, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return fallback;

  // Reject protocol-relative URLs (//example.com)
  if (trimmed.startsWith('//')) return fallback;

  // Must begin with a single forward slash or query string '?'
  if (trimmed.startsWith('/') || trimmed.startsWith('?')) {
    // Ensure second character is not another slash (extra defense against ///evil.com)
    if (trimmed.startsWith('/') && trimmed.length > 1 && trimmed[1] === '/') {
      return fallback;
    }
    return trimmed;
  }

  return fallback;
}

export function saveReturnToUrl(url: string): void {
  const sanitized = sanitizeReturnToUrl(url);
  safeStorageSet(RETURN_TO_STORAGE_KEY, sanitized);
}

export function getSavedReturnToUrl(): string | null {
  const raw = safeStorageGet(RETURN_TO_STORAGE_KEY);
  if (!raw) return null;
  const sanitized = sanitizeReturnToUrl(raw);
  return sanitized === '/' ? null : sanitized;
}

export function clearSavedReturnToUrl(): void {
  safeStorageRemove(RETURN_TO_STORAGE_KEY);
}

export function getCurrentUser(): AuthUser | null {
  const raw = safeStorageGet(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === 'string' && typeof parsed.email === 'string') {
      return parsed as AuthUser;
    }
  } catch {
    // Malformed storage
  }
  return null;
}

export function isAuthenticated(): boolean {
  return getCurrentUser() !== null;
}

export function subscribeToAuthChanges(listener: AuthListener): () => void {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

function notifyAuthListeners(user: AuthUser | null): void {
  authListeners.forEach((listener) => {
    try {
      listener(user);
    } catch {
      // Listener error guard
    }
  });
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
    throw new Error('Please enter a valid email address.');
  }
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  // Generate deterministic/consistent ID for mock local auth
  const userId = `usr_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`;
  const user: AuthUser = {
    id: userId,
    email: cleanEmail,
    name: cleanEmail.split('@')[0],
    createdAt: new Date().toISOString(),
  };

  safeStorageSet(SESSION_STORAGE_KEY, JSON.stringify(user));
  notifyAuthListeners(user);
  return user;
}

export async function signup(email: string, password: string, name?: string): Promise<AuthUser> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
    throw new Error('Please enter a valid email address.');
  }
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  const userId = `usr_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`;
  const user: AuthUser = {
    id: userId,
    email: cleanEmail,
    name: name?.trim() || cleanEmail.split('@')[0],
    createdAt: new Date().toISOString(),
  };

  safeStorageSet(SESSION_STORAGE_KEY, JSON.stringify(user));
  notifyAuthListeners(user);
  return user;
}

export function logout(): void {
  safeStorageRemove(SESSION_STORAGE_KEY);
  notifyAuthListeners(null);
}
