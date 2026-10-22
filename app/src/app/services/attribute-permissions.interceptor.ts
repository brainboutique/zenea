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

      // Only GET responses carry the permission headers (entity list / single
      // entity). Write responses (PUT/PATCH/DELETE) omit them, so interpreting
      // "header absent" as "no restrictions" would wipe the current sets on
      // every save. That flips every isReadable()/isFieldReadOnly() gate in the
      // form twice per save (wipe, then restore by the follow-up list GET),
      // destroying and re-creating inputs while the user is typing — the caret
      // jumps. Absent headers therefore only clear the sets for GETs.
      const mayClear = req.method === 'GET';

      if (readableHeader !== null) {
        perms.setReadable(new Set(readableHeader.split(',').map(s => s.trim()).filter(Boolean)));
      } else if (mayClear) {
        perms.setReadable(null);
      }

      if (writableHeader !== null) {
        perms.setWritable(new Set(writableHeader.split(',').map(s => s.trim()).filter(Boolean)));
      } else if (mayClear) {
        perms.setWritable(null);
      }
    })
  );
};
