import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

const STORAGE_KEY = 'zenea_google_id_token';

/**
 * Holds the Google ID token for API Bearer auth and builds the login redirect URL.
 * When the API returns 401 "Authentication required", the frontend redirects to
 * the backend login route with the current URL as redirect_uri (inferred from the browser).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private token: string | null = null;
  private snackBar = inject(MatSnackBar);

  getToken(): string | null {
    if (this.token !== null) return this.token;
    if (typeof sessionStorage !== 'undefined') {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) this.token = stored;
    }
    return this.token;
  }

  setToken(value: string | null): void {
    this.token = value;
    if (typeof sessionStorage !== 'undefined') {
      if (value) sessionStorage.setItem(STORAGE_KEY, value);
      else sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  /** Current app URL to return to after login (origin + pathname + search, no hash). */
  getCurrentRedirectUri(): string {
    if (typeof window === 'undefined') return '';
    return window.location.origin + window.location.pathname + window.location.search;
  }

  /** Full URL to start Google login: backend auth/login with redirect_uri = current URL. */
  getLoginUrl(): string {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const redirectUri = this.getCurrentRedirectUri();
    return `${base}/api/v1/auth/login?redirect_uri=${encodeURIComponent(redirectUri)}`;
  }

  getEmail(): string | null {
    const token = this.getToken();
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.email ?? null;
    } catch {
      return null;
    }
  }

  logout(): void {
    this.setToken(null);
  }

  /**
   * Call on app init: read access_token or auth_error from hash and clear hash.
   * Returns true if token was set, false if auth_error or nothing.
   */
  initFromHash(): void {
    if (typeof window === 'undefined' || !window.location.hash) return;
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    const error = params.get('auth_error');
    const newUrl = window.location.pathname + window.location.search;
    if (typeof history !== 'undefined' && history.replaceState) {
      history.replaceState(null, '', newUrl);
    }
    if (token) this.setToken(token);
    if (error) {
      this.setToken(null);
      this.snackBar.open(error === 'access denied' ? 'Access denied' : 'Authentication failed', '', {
        duration: 5000,
        panelClass: ['snackbar-error'],
      });
    }
  }
}
