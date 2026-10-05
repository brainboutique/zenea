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

export interface BusinessProcessItem {
  id: string;
  rbaEntityId: string;
  name: string;
  entityType?: string | null;
  category?: string | null;
  description?: string | null;
  genericBPRefName?: string | null;
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class BusinessProcessesDataService {
  private readonly enabled = signal(false);

  readonly processes = signal<BusinessProcessItem[]>([]);
  readonly loading = signal<boolean>(false);

  private lastRepoBranchKey: string | null = null;
  private loadSeq = 0;

  constructor(private entityApi: EntityApiService, private userConfig: UserConfigService) {
    effect(() => {
      if (!this.enabled()) return;

      const repo = this.userConfig.getRepoName().trim() || 'local';
      const branch = this.userConfig.getBranch().trim() || 'default';
      const key = `${repo}|${branch}`;
      if (this.lastRepoBranchKey === key) return;
      this.lastRepoBranchKey = key;
      this.processes.set([]);
      this.load();
    });
  }

  ensureLoaded(): void {
    this.enabled.set(true);
  }

  private load(): void {
    const seq = ++this.loadSeq;
    this.loading.set(true);
    this.entityApi.listAllBusinessProcesses().subscribe({
      next: (list) => {
        if (seq !== this.loadSeq) return;
        const safeList = Array.isArray(list) ? list : [];
        this.processes.set(
          safeList.map((e: Record<string, unknown>) => ({
            id: (e['id'] as string) ?? '',
            rbaEntityId: (e['rbaEntityId'] as string) ?? (e['id'] as string) ?? '',
            name: (e['name'] as string) ?? (e['displayName'] as string) ?? '',
            entityType: (e['entityType'] as string) ?? null,
            category: (e['category'] as string) ?? null,
            description: (e['description'] as string) ?? null,
            genericBPRefName: (e['genericBPRefName'] as string) ?? null,
          }))
        );
        this.loading.set(false);
      },
      error: () => {
        if (seq !== this.loadSeq) return;
        this.loading.set(false);
      },
    });
  }

  applyFilters(filters: { name?: string }): BusinessProcessItem[] {
    let result = this.processes();
    const name = filters.name?.trim().toLowerCase();
    if (name) {
      result = result.filter((p) => p.name.toLowerCase().includes(name));
    }
    return result;
  }
}
