/*
 * Copyright (C) 2026 BrainBoutique Solutions GmbH (Wilko Hein)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <https://www.gnu.org>.
 */

import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, tap, catchError, of, map, throwError } from 'rxjs';
import { ConfigService } from './config.service';

const STORAGE_KEY = 'zenea_token';
const AUTH_MODE_KEY = 'zenea_auth_mode';
const AUTH_MODE_GOOGLE = 'Google';
const AUTH_MODE_LOCAL = 'Local';

/**
 * Holds the authentication token for API Bearer auth and handles login flows.
 * For Google OAuth: builds login redirect URL and reads token from URL hash.
 * For Local auth: calls login API endpoint.
 * When the API returns 401 "Authentication required", the frontend redirects to
 * the appropriate login (Google redirect or local login page).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private token: string | null = null;
  private authMode: string | null = null;
  private snackBar = inject(MatSnackBar);
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private _authMode = signal<string | null>(null);
  readonly authMode$ = this._authMode.asReadonly();

  private _hasValidSession = signal(false);
  readonly hasValidSession$ = this._hasValidSession.asReadonly();

  readonly requiresAuth$ = () => {
    const mode = this._authMode();
    return mode === 'Local' || mode === 'Google';
  };

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
    this._hasValidSession.set(this.checkTokenValidity(value));
    if (typeof sessionStorage !== 'undefined') {
      if (value) sessionStorage.setItem(STORAGE_KEY, value);
      else sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  private checkTokenValidity(token: string | null): boolean {
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  getAuthMode(): string | null {
    if (this.authMode !== null) return this.authMode;
    if (typeof sessionStorage !== 'undefined') {
      this.authMode = sessionStorage.getItem(AUTH_MODE_KEY);
      if (this.authMode && !this._authMode()) {
        this._authMode.set(this.authMode);
      }
    }
    return this.authMode;
  }

  setAuthMode(mode: string): void {
    this.authMode = mode;
    this._authMode.set(mode);
    if (typeof sessionStorage !== 'undefined') {
      if (mode) sessionStorage.setItem(AUTH_MODE_KEY, mode);
      else sessionStorage.removeItem(AUTH_MODE_KEY);
    }
  }

  getRequiresAuth(): Observable<{ mode: string }> {
    return this.http.get<{ mode: string }>('/api/v1/auth/mode').pipe(
      tap((response) => {
        this.setAuthMode(response.mode || '');
        this.hasValidSession();
      }),
      catchError(() => of({ mode: '' }))
    );
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

  getLoginPageUrl(): string {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const redirectUri = this.getCurrentRedirectUri();
    return `${base}/login?redirect=${encodeURIComponent(redirectUri)}`;
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
    if (this.getAuthMode() === AUTH_MODE_LOCAL) {
      this.http.post('/api/v1/auth/local/logout', {}).subscribe();
    }
    this.setToken(null);
  }

  /**
   * Login with username and password for Local authentication.
   */
  loginLocal(username: string, password: string): Observable<boolean> {
    return this.http
      .post<{ token: string; expiresIn: number }>('/api/v1/auth/local/login', {
        username,
        password,
      })
      .pipe(
        tap((response) => {
          this.setToken(response.token);
          this.setAuthMode(AUTH_MODE_LOCAL);
        }),
        map(() => true),
        catchError((err) => {
          this.setToken(null);
          return throwError(() => err);
        })
      );
  }

  /**
   * Check if user has a valid token.
   */
  hasValidSession(): boolean {
    const token = this.getToken();
    const valid = this.checkTokenValidity(token);

    if (token && !valid) {
      this.setToken(null);
    }
    this._hasValidSession.set(valid);
    return valid;
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
    if (token) {
      this.setToken(token);
      this.setAuthMode(AUTH_MODE_GOOGLE);
    }
    if (error) {
      this.setToken(null);
      this.snackBar.open(error === 'access denied' ? 'Access denied' : 'Authentication failed', '', {
        duration: 5000,
        panelClass: ['snackbar-error'],
      });
    }
  }
}
