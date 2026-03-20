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
