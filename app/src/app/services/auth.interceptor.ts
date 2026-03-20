import {
  HttpInterceptorFn,
  HttpErrorResponse,
} from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { catchError, EMPTY, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * Adds Bearer token to API requests when present; on 401 "Authentication required"
 * redirects to Google login with current URL as redirect_uri; on 403 shows "Access denied" toast.
 *
 * During SSR, API calls are skipped entirely (auth is browser-only).
 * The client will make the real requests after hydration.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const platformId = inject(PLATFORM_ID);

  if (isPlatformServer(platformId) && req.url.includes('/api/')) {
    return EMPTY;
  }

  const auth = inject(AuthService);
  const snackBar = inject(MatSnackBar);

  const token = auth.getToken();
  const modified = token
    ? req.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      })
    : req;

  return next(modified).pipe(
    catchError((err: HttpErrorResponse) => {
      const isApi = req.url.includes('/api/');
      const msg = err.error?.message ?? err.message ?? '';

      if (isApi && err.status === 401 && /authentication required/i.test(msg)) {
        window.location.href = auth.getLoginUrl();
        return throwError(() => err);
      }
      if (isApi && err.status === 403) {
        snackBar.open('Access denied', '', {
          duration: 5000,
          panelClass: ['snackbar-error'],
        });
      }
      return throwError(() => err);
    })
  );
};
