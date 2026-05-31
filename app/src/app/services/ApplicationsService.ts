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

/** Single application from the applications list (id, displayName, optional TIME classification). */
export interface ApplicationItem {
  id: string;
  displayName: string;
  lxTimeClassification?: string | null;
  capabilityNames?: string[];
  technicalSuitability?: string | null;
  functionalSuitability?: string | null;
  businessCriticality?: string | null;
  platformTEMP?: string | null;
  earmarkingsTEMP?: string | null;
  description?: string | null;
  relApplicationToBusinessCapability?: Array<{ id: string; displayName: string; fullName?: string }>;
  relApplicationToUserGroup?: Array<{ id: string; displayName: string; fullName?: string }>;
  relApplicationToDataProduct?: Array<{ id: string; displayName: string; fullName?: string }>;
  migrationTarget?: Array<{ id: string; displayName: string }>;
  alternatives?: Array<{ id: string; displayName: string }>;
  ApplicationLifecycle?: { asString?: string | null } | null;
  tags?: Array<{ id: string; name: string; color?: string | null; description?: string | null; tagGroupId?: string | null }>;
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class ApplicationsService {
  /** When true, start loading applications (lazy to avoid duplicate list loads). */
  private readonly enabled = signal(false);

  /** Loaded applications list; empty until GET /api/v1/applications has completed. */
  readonly applications = signal<ApplicationItem[]>([]);
  /** Whether the applications list is currently loading. */
  readonly loading = signal<boolean>(false);

  /** Bump to force a reload of applications (used for migrationTarget dropdown invalidation). */
  private readonly cacheInvalidationNonce = signal(0);

  /** Last repo|branch key+nonce used to load applications, to avoid duplicate reloads. */
  private lastRepoBranchKey: string | null = null;
  private lastCacheInvalidationNonceSeen = 0;

  /** Sequence id to ignore stale in-flight loads. */
  private loadSeq = 0;

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
        this.applications.set([]);
        this.load();
      }
    );
  }

  /** Start (or re-start) loading applications; safe to call multiple times. */
  ensureLoaded(): void {
    this.enabled.set(true);
  }

  /**
   * Invalidate the browser-side cache of applications used in the migration target dialog.
   * Next open of the dialog will see the reloaded list.
   */
  invalidateMigrationTargetOptionsCache(): void {
    this.cacheInvalidationNonce.update((n) => n + 1);
  }

  load(): void {
    const seq = ++this.loadSeq;
    this.loading.set(true);

    // Read active applications from the (typed) entities API via EntityApiService.
    this.entityApi.listAllEntities().subscribe({
      next: (list) => {
        // If a newer load started, ignore this response.
        if (seq !== this.loadSeq) return;
        const safeList = Array.isArray(list) ? list : [];
        this.applications.set(
          safeList.map((e) => {
            const rawCaps = (e as any).relApplicationToBusinessCapability;
            const capabilityNames: string[] = Array.isArray(rawCaps)
              ? rawCaps
                  .map((c: any) => String(c?.displayName ?? c?.fullName ?? c?.id ?? '').trim())
                  .filter((s: string) => s.length > 0)
              : [];
            const toRelationArray = (raw: any): Array<{ id: string; displayName: string; fullName?: string }> => {
              if (!Array.isArray(raw)) return [];
              return raw.map((r: any) => ({
                id: String(r?.id ?? ''),
                displayName: String(r?.displayName ?? r?.fullName ?? r?.id ?? ''),
                fullName: r?.fullName ? String(r.fullName) : undefined,
              }));
            };
            const toIdDisplayNameArray = (raw: any): Array<{ id: string; displayName: string }> => {
              if (!Array.isArray(raw)) return [];
              return raw.map((r: any) => ({
                id: String(r?.id ?? ''),
                displayName: String(r?.displayName ?? r?.id ?? ''),
              }));
            };
            // Start with ALL fields from the API response (preserves custom fields)
            const base = { ...(e as any) };
            // Ensure specific fields are correctly formatted
            base.id = String((e as any).id ?? '');
            base.displayName = String((e as any).displayName ?? '');
            base.capabilityNames = capabilityNames;
            base.technicalSuitability = (e as any).technicalSuitability ?? null;
            base.functionalSuitability = (e as any).functionalSuitability ?? null;
            base.businessCriticality = (e as any).businessCriticality ?? null;
            base.platformTEMP = (e as any).platformTEMP ?? null;
            base.earmarkingsTEMP = (e as any).earmarkingsTEMP ?? null;
            base.description = (e as any).description ?? null;
            base.relApplicationToBusinessCapability = toRelationArray(rawCaps);
            base.relApplicationToUserGroup = toRelationArray((e as any).relApplicationToUserGroup);
            base.relApplicationToDataProduct = toRelationArray((e as any).relApplicationToDataProduct);
            base.migrationTarget = toIdDisplayNameArray((e as any).migrationTarget);
            base.alternatives = toIdDisplayNameArray((e as any).alternatives);
            base.ApplicationLifecycle = (e as any).ApplicationLifecycle ?? null;
            base.tags = this.extractTags((e as any).tags);
            return base;
          })
        );
        this.loading.set(false);
      },
      error: () => {
        if (seq !== this.loadSeq) return;
        this.applications.set([]);
        this.loading.set(false);
      },
    });
  }

  filterByName(nameText: string): ApplicationItem[] {
    const q = (nameText ?? '').trim().toLowerCase();
    if (!q) return this.applications();
    return this.applications().filter((app) => {
      const nameAndEarmarkings = [app.displayName, app.earmarkingsTEMP ?? ''].filter(Boolean).join(' ');
      if (nameAndEarmarkings.toLowerCase().includes(q)) return true;
      if (app.relApplicationToBusinessCapability?.some((c) => c.displayName.toLowerCase().includes(q))) return true;
      if (app.relApplicationToUserGroup?.some((g) => (g.displayName ?? g.fullName ?? '').toLowerCase().includes(q))) return true;
      if (app.relApplicationToDataProduct?.some((p) => (p.displayName ?? p.fullName ?? '').toLowerCase().includes(q))) return true;
      const serializeTargets = (targets: Array<{ id: string; displayName: string }>) =>
        targets.map((m) => m.displayName).join(' ').toLowerCase();
      if (app.migrationTarget && serializeTargets(app.migrationTarget).includes(q)) return true;
      if (app.alternatives && serializeTargets(app.alternatives).includes(q)) return true;
      return false;
    });
  }

  filterByTimeClassification(value: string): ApplicationItem[] {
    if (!value) return this.applications();
    if (value === 'empty') {
      return this.applications().filter((e) => !e.lxTimeClassification || (e.lxTimeClassification as string).trim() === '');
    }
    return this.applications().filter(
      (e) => (e.lxTimeClassification ?? '').toString().toLowerCase() === value.toLowerCase()
    );
  }

  filterByNorthStarClassification(value: string): ApplicationItem[] {
    if (!value) return this.applications();
    if (value === 'empty') {
      return this.applications().filter((e) => !e['northStarClassification'] || (e['northStarClassification'] as string).trim() === '');
    }
    return this.applications().filter(
      (e) => (e['northStarClassification'] ?? '').toString().toLowerCase() === value.toLowerCase()
    );
  }

  filterByBusinessCriticality(value: string): ApplicationItem[] {
    if (!value) return this.applications();
    if (value === 'empty') {
      return this.applications().filter((e) => !e.businessCriticality || (e.businessCriticality as string).trim() === '');
    }
    return this.applications().filter(
      (e) => (e.businessCriticality ?? '').toString().toLowerCase() === value.toLowerCase()
    );
  }

  filterByTechnicalSuitability(value: string): ApplicationItem[] {
    if (!value) return this.applications();
    if (value === 'empty') {
      return this.applications().filter((e) => !e.technicalSuitability || (e.technicalSuitability as string).trim() === '');
    }
    return this.applications().filter(
      (e) => (e.technicalSuitability ?? '').toString().toLowerCase() === value.toLowerCase()
    );
  }

  filterByFunctionalSuitability(value: string): ApplicationItem[] {
    if (!value) return this.applications();
    if (value === 'empty') {
      return this.applications().filter((e) => !e.functionalSuitability || (e.functionalSuitability as string).trim() === '');
    }
    return this.applications().filter(
      (e) => (e.functionalSuitability ?? '').toString().toLowerCase() === value.toLowerCase()
    );
  }

  filterByPlatformTEMP(value: string): ApplicationItem[] {
    if (!value) return this.applications();
    return this.applications().filter(
      (e) => (e.platformTEMP ?? '') === value
    );
  }

  filterByTag(tagId: string): ApplicationItem[] {
    if (!tagId) return this.applications();
    return this.applications().filter(
      (e) => e.tags?.some((t) => t.id === tagId)
    );
  }

  private extractTags(raw: any): Array<{ id: string; name: string; color?: string | null; description?: string | null; tagGroupId?: string | null }> {
    if (!Array.isArray(raw)) return [];
    return raw.map((t: any) => ({
      id: String(t?.id ?? ''),
      name: String(t?.name ?? ''),
      color: t?.color ?? null,
      description: t?.description ?? null,
      tagGroupId: t?.tagGroup?.id ?? null,
    }));
  }

  filterByBusinessCapability(displayName: string): ApplicationItem[] {
    if (!displayName) return this.applications();
    return this.applications().filter(
      (e) => e.relApplicationToBusinessCapability?.some((c) => c.displayName.includes(displayName))
    );
  }

  filterByUserGroup(displayName: string): ApplicationItem[] {
    if (!displayName) return this.applications();
    return this.applications().filter(
      (e) => e.relApplicationToUserGroup?.some((g) => (g.displayName ?? g.fullName ?? '').includes(displayName))
    );
  }

  filterByDataProduct(displayName: string): ApplicationItem[] {
    if (!displayName) return this.applications();
    return this.applications().filter(
      (e) => e.relApplicationToDataProduct?.some((p) => (p.displayName ?? p.fullName ?? '').includes(displayName))
    );
  }

  applyFilters(filters: {
    name?: string;
    technicalSuitability?: string;
    functionalSuitability?: string;
    lxTimeClassification?: string;
    northStarClassification?: string;
    businessCriticality?: string;
    relApplicationToBusinessCapability?: string;
    relApplicationToUserGroup?: string;
    relApplicationToProject?: string;
    relApplicationToDataProduct?: string;
    platformTEMP?: string;
    tags?: string[];
    customFields?: Record<string, string>;
  }): ApplicationItem[] {
    let result = this.filterByName(filters.name ?? '');
    const allApps = this.applications();
    if (filters.technicalSuitability) {
      const filtered = this.filterByTechnicalSuitability(filters.technicalSuitability);
      result = result.filter((a) => filtered.includes(a));
    }
    if (filters.functionalSuitability) {
      const filtered = this.filterByFunctionalSuitability(filters.functionalSuitability);
      result = result.filter((a) => filtered.includes(a));
    }
    if (filters.lxTimeClassification) {
      const filtered = this.filterByTimeClassification(filters.lxTimeClassification);
      result = result.filter((a) => filtered.includes(a));
    }
    if (filters.northStarClassification) {
      const filtered = this.filterByNorthStarClassification(filters.northStarClassification);
      result = result.filter((a) => filtered.includes(a));
    }
    if (filters.businessCriticality) {
      const filtered = this.filterByBusinessCriticality(filters.businessCriticality);
      result = result.filter((a) => filtered.includes(a));
    }
    if (filters.platformTEMP) {
      const filtered = this.filterByPlatformTEMP(filters.platformTEMP);
      result = result.filter((a) => filtered.includes(a));
    }
    if (filters.relApplicationToBusinessCapability) {
      const filtered = this.filterByBusinessCapability(filters.relApplicationToBusinessCapability);
      result = result.filter((a) => filtered.includes(a));
    }
    if (filters.relApplicationToUserGroup) {
      const filtered = this.filterByUserGroup(filters.relApplicationToUserGroup);
      result = result.filter((a) => filtered.includes(a));
    }
    if (filters.relApplicationToDataProduct) {
      const filtered = this.filterByDataProduct(filters.relApplicationToDataProduct);
      result = result.filter((a) => filtered.includes(a));
    }
    if (filters.tags && filters.tags.length > 0) {
      const filtered = this.filterByTags(filters.tags);
      result = result.filter((a) => filtered.includes(a));
    }
    if (filters.customFields) {
      const filtered = this.filterByCustomFields(filters.customFields);
      result = result.filter((a) => filtered.includes(a));
    }
    return result;
  }

  filterByTags(tagIds: string[]): ApplicationItem[] {
    if (!tagIds || tagIds.length === 0) return this.applications();
    return this.applications().filter(
      (e) => tagIds.every((tagId) => e.tags?.some((t) => t.id === tagId))
    );
  }

  filterByCustomFields(fields: Record<string, string>): ApplicationItem[] {
    const entries = Object.entries(fields).filter(([, v]) => v);
    if (entries.length === 0) return this.applications();
    return this.applications().filter((e) =>
      entries.every(([key, value]) => {
        const entityVal = (e as unknown as Record<string, unknown>)[key];
        if (entityVal == null) return false;
        if (Array.isArray(entityVal)) {
          return entityVal.includes(value);
        }
        return String(entityVal) === value;
      })
    );
  }
}
