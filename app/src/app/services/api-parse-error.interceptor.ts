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

import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

/**
 * Catches API responses that return 200 with non-JSON body (e.g. HTML from proxy
 * or backend), which would otherwise cause "Http failure during parsing".
 * Replaces with a clearer error so devs know to check the API/proxy.
 */
export const apiParseErrorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const isApiRequest = req.url.includes('/api/');
      const isParseError =
        err.status === 200 &&
        (err.error instanceof ProgressEvent || (typeof err.message === 'string' && err.message.includes('parsing')));
      if (isApiRequest && isParseError) {
        const msg =
          'API returned a non-JSON response (e.g. HTML). ' +
          'For local dev, ensure the backend is running (e.g. php artisan serve) and the proxy target is http://localhost:8000.';
        return throwError(() => new HttpErrorResponse({ error: msg, status: err.status, statusText: err.statusText }));
      }
      return throwError(() => err);
    })
  );
};
