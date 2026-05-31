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

import { Injectable, signal, inject } from '@angular/core';
import { UserGroupsService } from '../services/api/api/userGroups.service';
import { UserConfigService } from './user-config.service';

export interface UserGroupItem {
  id: string;
  displayName: string;
  fullName?: string;
  category?: string;
  description?: string;
  countryIsoCode?: string;
  parent?: string;
}

@Injectable({ providedIn: 'root' })
export class UserGroupsDataService {
  private api = inject(UserGroupsService);
  private userConfig = inject(UserConfigService);

  readonly data = signal<UserGroupItem[]>([]);
  readonly loading = signal(false);

  private lastRepoBranchKey: string | null = null;
  private loadSeq = 0;

  ensureLoaded(): void {
    if (this.data().length > 0 || this.loading()) return;
    this.load();
  }

  load(): void {
    const repo = this.userConfig.getRepoName().trim() || 'local';
    const branch = this.userConfig.getBranch().trim() || 'default';
    const key = `${repo}|${branch}`;
    if (this.lastRepoBranchKey === key && this.data().length > 0) return;
    this.lastRepoBranchKey = key;

    const seq = ++this.loadSeq;
    this.loading.set(true);
    this.data.set([]);

    this.api.getUserGroupsRepoBranch(repo, branch).subscribe({
      next: (body) => {
        if (seq !== this.loadSeq) return;
        const raw = Array.isArray(body) ? body : (body?.userGroups ?? []);
        const items = Array.isArray(raw) ? raw : [];
        console.log('[UserGroupsDataService] Loaded', items.length, 'user groups');
        if (items.length > 0) {
          console.log('[UserGroupsDataService] Sample:', items.slice(0, 3).map((g: any) => ({ id: g.id, displayName: g.displayName, category: g.category, countryIsoCode: g.countryIsoCode })));
        }
        this.data.set(
          items.map((g: any) => ({
            id: String(g?.id ?? ''),
            displayName: String(g?.displayName ?? g?.fullName ?? g?.id ?? ''),
            fullName: g?.fullName ? String(g.fullName) : undefined,
            category: g?.category ? String(g.category) : undefined,
            description: g?.description ? String(g.description) : undefined,
            countryIsoCode: g?.countryIsoCode ? String(g.countryIsoCode) : undefined,
            parent: g?.parent ? String(g.parent) : undefined,
          }))
        );
        this.loading.set(false);
      },
      error: () => {
        if (seq !== this.loadSeq) return;
        this.data.set([]);
        this.loading.set(false);
      },
    });
  }

  getRegionUserGroups(): UserGroupItem[] {
    return this.data().filter((g) => g.category === 'region');
  }

  getUserGroupsWithIsoCode(): UserGroupItem[] {
    return this.data().filter((g) => g.countryIsoCode);
  }
}
