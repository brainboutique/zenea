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
 * You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <https://www.gnu.org/>.
 */

import { HttpInterceptorFn, HttpHeaderResponse, HttpResponse, HttpHeaders } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { AttributePermissionsService } from './attribute-permissions.service';

/**
 * Captures X-Readable-Attributes / X-Writable-Attributes headers from
 * entity list and entity GET responses and stores them in
 * AttributePermissionsService.
 *
 * Both HttpHeaderResponse and HttpResponse carry headers; we check for either.
 * The generated API uses observe:'body' (default) so the subscriber never sees
 * HttpResponse, but the interceptor chain still gets the full HttpEvent stream.
 */
export const attributePermissionsInterceptor: HttpInterceptorFn = (req, next) => {
  const perms = inject(AttributePermissionsService);

  return next(req).pipe(
    tap(event => {
      if (!req.url.includes('/entit')) {
        return;
      }

      // Extract headers from whichever event type carries them
      let headers: HttpHeaders | null = null;
      if (event instanceof HttpHeaderResponse) {
        headers = event.headers;
      } else if (event instanceof HttpResponse) {
        headers = event.headers;
      } else if (event && typeof event === 'object' && 'headers' in event && event.headers instanceof HttpHeaders) {
        headers = event.headers as HttpHeaders;
      }

      if (!headers) {
        return;
      }

      const readableHeader = headers.get('X-Readable-Attributes');
      const writableHeader = headers.get('X-Writable-Attributes');

      console.log('[attr-perms] entity response:', {
        url: req.url,
        readableHeader,
        writableHeader,
        allHeaders: headers.keys(),
        eventType: event?.constructor?.name,
      });

      if (readableHeader !== null) {
        perms.setReadable(new Set(readableHeader.split(',').map(s => s.trim()).filter(Boolean)));
      } else {
        perms.setReadable(null);
      }

      if (writableHeader !== null) {
        perms.setWritable(new Set(writableHeader.split(',').map(s => s.trim()).filter(Boolean)));
      } else {
        perms.setWritable(null);
      }
    })
  );
};
