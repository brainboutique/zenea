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
import { FacetsService as ApiFacetsService } from '../services/api/api/facets.service';
import { UserConfigService } from './user-config.service';

/** Facet key (e.g. relApplicationToUserGroup). Keys starting with "_" are excluded. */
export type FacetKey = string;

/** Single relation fact sheet summary from facets. */
export interface FacetRelationItem {
  id: string;
  displayName: string;
  fullName?: string;
  type?: string;
  category?: string;
  description?: string;
}

@Injectable({ providedIn: 'root' })
export class FacetsService {
  /** Loaded facets document; empty until GET /api/v1/facets has completed. */
  readonly data = signal<Record<string, unknown>>({});

  /** Bump to force a reload regardless of repo/branch key. */
  private readonly cacheInvalidationNonce = signal(0);

  /** Last repo|branch key used to load facets, to avoid duplicate reloads. */
  private lastRepoBranchKey: string | null = null;
  private lastNonceSeen = 0;

  constructor(private apiFacets: ApiFacetsService, private userConfig: UserConfigService) {
    effect(
      () => {
        const repo = this.userConfig.getRepoName().trim() || 'local';
        const branch = this.userConfig.getBranch().trim() || 'default';
        const key = `${repo}|${branch}`;
        const nonce = this.cacheInvalidationNonce();
        if (this.lastRepoBranchKey === key && this.lastNonceSeen === nonce) return;
        this.lastRepoBranchKey = key;
        this.lastNonceSeen = nonce;
        this.data.set({});
        this.load();
      }
    );
  }

  invalidateCache(): void {
    this.lastRepoBranchKey = null;
    this.lastNonceSeen = 0;
    this.data.set({});
    this.cacheInvalidationNonce.update(n => n + 1);
  }

  /** Reload facets from API (e.g. after repo/branch change). */
  load(): void {
    const repo = this.userConfig.getRepoName().trim() || 'local';
    const branch = this.userConfig.getBranch().trim() || 'default';
    this.apiFacets.getFacetsRepoBranch(repo, branch).subscribe({
      next: (body) => this.data.set((body as Record<string, unknown>) ?? {}),
      error: () => this.data.set({}),
    });
  }

  /**
   * Returns facet keys from the loaded data, excluding any key that starts with "_".
   */
  getFacets(): FacetKey[] {
    const d = this.data();
    return Object.keys(d).filter((k) => !k.startsWith('_'));
  }

  /**
   * Returns the contents for the given facet key (e.g. array of relation items or tags), or null if not present.
   */
  getFacet(id: string): unknown {
    const d = this.data();
    return d[id] ?? null;
  }
}
