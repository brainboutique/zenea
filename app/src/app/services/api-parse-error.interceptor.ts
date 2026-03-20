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
