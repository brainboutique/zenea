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

import { Injectable, signal } from '@angular/core';

/**
 * Cache buster service. Increment the signal after any mutation (PATCH/PUT/DELETE)
 * to force subsequent GET requests for entity lists to bypass server-side caches.
 */
@Injectable({ providedIn: 'root' })
export class CacheBusterService {
  /** Opaque value that changes after every mutation. Append as query param to GET requests. */
  readonly version = signal(0);

  /** Bump after any PATCH/PUT/DELETE to an entity. */
  bump(): void {
    this.version.update((n) => n + 1);
  }
}
