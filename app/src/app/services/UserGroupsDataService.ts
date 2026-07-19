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
  level?: number;
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

  invalidateCache(): void {
    this.lastRepoBranchKey = null;
    this.data.set([]);
    this.loading.set(false);
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
            level: g?.level != null ? Number(g.level) : undefined,
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

  /**
   * Resolve the countryIsoCode for a given user group id by walking the parent
   * chain toward the root.  Returns the first non-empty countryIsoCode found,
   * or undefined if none is set on the chain.
   */
  resolveCountryIsoCode(groupId: string): string | undefined {
    const all = this.data();
    const byId = new Map<string, UserGroupItem>();
    for (const g of all) byId.set(g.id, g);

    let current: UserGroupItem | undefined = byId.get(groupId);
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      if (current.countryIsoCode) return current.countryIsoCode;
      visited.add(current.id);
      current = current.parent ? byId.get(current.parent) : undefined;
    }
    return undefined;
  }

  /**
   * Return user groups (any node, not just leaves) whose id is in `referencedIds`,
   * in depth-first order.
   */
  getMatrixUserGroups(referencedIds: Set<string>): UserGroupItem[] {
    const all = this.data();
    if (all.length === 0) return [];

    const byId = new Map<string, UserGroupItem>();
    const childrenOf = new Map<string, UserGroupItem[]>();
    for (const g of all) {
      byId.set(g.id, g);
      if (g.parent) {
        const list = childrenOf.get(g.parent) ?? [];
        list.push(g);
        childrenOf.set(g.parent, list);
      }
    }

    const roots = all.filter((g) => !g.parent || !byId.has(g.parent));
    const result: UserGroupItem[] = [];
    const visited = new Set<string>();

    function walk(node: UserGroupItem): void {
      if (visited.has(node.id)) return;
      visited.add(node.id);
      if (referencedIds.has(node.id)) result.push(node);
      const kids = childrenOf.get(node.id);
      if (kids) {
        for (const child of kids) walk(child);
      }
    }

    for (const root of roots) walk(root);
    return result;
  }

  /**
   * For each leaf user group id, return the set of all ancestor ids on the path to root
   * (including the leaf's own id). Used for indirect-link marking in the Excel matrix.
   */
  getAncestorIdSets(leafIds: string[]): Map<string, Set<string>> {
    const all = this.data();
    const byId = new Map<string, UserGroupItem>();
    for (const g of all) byId.set(g.id, g);

    const result = new Map<string, Set<string>>();
    for (const lid of leafIds) {
      const chain = new Set<string>();
      let cur: string | undefined = lid;
      while (cur && !chain.has(cur)) {
        chain.add(cur);
        cur = byId.get(cur)?.parent;
      }
      result.set(lid, chain);
    }
    return result;
  }
}
