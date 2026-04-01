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

import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type EntityListRefreshEvent = 'show-loading' | 'reload';

/** Service to trigger entity list reload (e.g. after Git branch switch or pull). */
@Injectable({ providedIn: 'root' })
export class EntityListRefreshService {
  private readonly refresh$ = new Subject<EntityListRefreshEvent>();

  /** Emit to show loading spinner and clear list (e.g. before branch switch). */
  triggerShowLoading(): void {
    this.refresh$.next('show-loading');
  }

  /** Emit to request that the entity list reloads. */
  triggerRefresh(): void {
    this.refresh$.next('reload');
  }

  /** Subscribe to refresh requests (used by list component). */
  get onRefresh() {
    return this.refresh$.asObservable();
  }
}
