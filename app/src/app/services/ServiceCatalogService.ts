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

import { Injectable, signal, effect, computed } from '@angular/core';
import { EntityApiService } from './entity-api.service';
import { UserConfigService } from './user-config.service';
import { ListEntities200ResponseInner } from './api/model/listEntities200ResponseInner';

function sortBySortOrder(items: ListEntities200ResponseInner[]): ListEntities200ResponseInner[] {
  return [...items].sort((a, b) => {
    const sa = (a as any).sortOrder;
    const sb = (b as any).sortOrder;
    const na = sa != null ? Number(sa) : NaN;
    const nb = sb != null ? Number(sb) : NaN;
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    if (!isNaN(na)) return -1;
    if (!isNaN(nb)) return 1;
    return 0;
  });
}

@Injectable({ providedIn: 'root' })
export class ServiceCatalogService {
  private readonly enabled = signal(false);

  readonly items = signal<ListEntities200ResponseInner[]>([]);
  readonly loading = signal<boolean>(false);

  private cacheInvalidationNonce = signal(0);

  private lastRepoBranchKey: string | null = null;
  private lastCacheInvalidationNonceSeen = 0;

  private loadSeq = 0;

  readonly rootItems = computed(() =>
    sortBySortOrder(
      this.items().filter((item) => {
        const parents = (item as any).parents;
        return !Array.isArray(parents) || parents.length === 0;
      })
    )
  );

  constructor(private entityApi: EntityApiService, private userConfig: UserConfigService) {
    effect(
      () => {
        if (!this.enabled()) return;

        const repo = this.userConfig.getRepoName().trim() || 'local';
        const branch = this.userConfig.getBranch().trim() || 'default';
        const key = `${repo}|${branch}`;
        const nonce = this.cacheInvalidationNonce();
        if (this.lastRepoBranchKey === key && this.lastCacheInvalidationNonceSeen === nonce) return;
        this.lastRepoBranchKey = key;
        this.lastCacheInvalidationNonceSeen = nonce;
        this.items.set([]);
        this.load();
      }
    );
  }

  ensureLoaded(): void {
    this.enabled.set(true);
  }

  invalidateCache(): void {
    this.cacheInvalidationNonce.update((n) => n + 1);
  }

  private load(): void {
    const seq = ++this.loadSeq;
    this.loading.set(true);

    this.entityApi.listAllServiceCatalogSections().subscribe({
      next: (list) => {
        if (seq !== this.loadSeq) return;
        const safeList = Array.isArray(list) ? list : [];
        this.items.set(safeList);
        this.loading.set(false);
      },
      error: () => {
        if (seq !== this.loadSeq) return;
        this.items.set([]);
        this.loading.set(false);
      },
    });
  }

  getItemsByParent(parentId: string | null): ListEntities200ResponseInner[] {
    return sortBySortOrder(
      this.items().filter((item) => {
        const parents = (item as any).parents;
        if (parentId === null) {
          return !Array.isArray(parents) || parents.length === 0;
        }
        return Array.isArray(parents) && parents.includes(parentId);
      })
    );
  }

  getItemById(id: string): ListEntities200ResponseInner | undefined {
    return this.items().find((item) => item.id === id);
  }

  filterByName(nameText: string): ListEntities200ResponseInner[] {
    const q = (nameText ?? '').trim().toLowerCase();
    if (!q) return sortBySortOrder(this.items());
    return sortBySortOrder(
      this.items().filter((item) =>
        (item.displayName ?? '').toLowerCase().includes(q)
      )
    );
  }
}
