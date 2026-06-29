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

import { Injectable, signal, effect } from '@angular/core';
import { EntityApiService } from './entity-api.service';
import { UserConfigService } from './user-config.service';

/** Lightweight representation of an Application entity. */
export interface CatalogApplicationItem {
  id: string;
  displayName: string;
  description?: string | null;
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class CatalogApplicationsService {
  private readonly enabled = signal(false);
  readonly items = signal<CatalogApplicationItem[]>([]);
  readonly loading = signal<boolean>(false);
  private readonly cacheInvalidationNonce = signal(0);
  private lastRepoBranchKey: string | null = null;
  private lastCacheInvalidationNonceSeen = 0;
  private loadSeq = 0;

  /** Fast lookup by id. */
  private idMap = signal<Map<string, CatalogApplicationItem>>(new Map());

  constructor(private entityApi: EntityApiService, private userConfig: UserConfigService) {
    effect(() => {
      if (!this.enabled()) return;
      const repo = this.userConfig.getRepoName().trim() || 'local';
      const branch = this.userConfig.getBranch().trim() || 'default';
      const key = `${repo}|${branch}`;
      const nonce = this.cacheInvalidationNonce();
      if (this.lastRepoBranchKey === key && this.lastCacheInvalidationNonceSeen === nonce) return;
      this.lastRepoBranchKey = key;
      this.lastCacheInvalidationNonceSeen = nonce;
      this.items.set([]);
      this.idMap.set(new Map());
      this.load();
    });
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
    this.entityApi.listAllEntities().subscribe({
      next: (list) => {
        if (seq !== this.loadSeq) return;
        const safeList = Array.isArray(list) ? list : [];
        const items: CatalogApplicationItem[] = safeList.map((e) => ({
          id: String((e as any).id ?? ''),
          displayName: String((e as any).displayName ?? ''),
          description: (e as any).description ?? null,
          ...(e as any),
        }));
        this.items.set(items);
        const map = new Map<string, CatalogApplicationItem>();
        for (const item of items) {
          map.set(item.id, item);
        }
        this.idMap.set(map);
        this.loading.set(false);
      },
      error: () => {
        if (seq !== this.loadSeq) return;
        this.items.set([]);
        this.idMap.set(new Map());
        this.loading.set(false);
      },
    });
  }

  getById(id: string): CatalogApplicationItem | undefined {
    return this.idMap().get(id);
  }
}
