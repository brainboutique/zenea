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
import { matchesSearch } from '../utils/search-utils';
import type { DynamicFilterCondition } from '../models/service-catalog-item';

/** Single application from the applications list (id, displayName, optional TIME classification). */
export interface ApplicationItem {
  id: string;
  displayName: string;
  status?: string | null;
  lxTimeClassification?: string | null;
  capabilityNames?: string[];
  technicalSuitability?: string | null;
  functionalSuitability?: string | null;
  businessCriticality?: string | null;
  description?: string | null;
  relApplicationToBusinessCapability?: Array<{ id: string; displayName: string; fullName?: string }>;
  relApplicationToUserGroup?: Array<{ id: string; displayName: string; fullName?: string }>;
  relApplicationToDataProduct?: Array<{ id: string; displayName: string; fullName?: string }>;
  migrationTarget?: Array<{ id: string; displayName: string; lifecycle?: string | null; proportion?: number | null; priority?: number | null; effort?: string | null; eta?: string | null; comments?: string | null }>;
  alternatives?: Array<{ id: string; displayName: string; functionalOverlap?: number | null; comment?: string | null }>;
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

  /** Pre-computed: for each entity ID, the set of all descendant IDs (including itself). */
  readonly bcDescendantMap = signal(new Map<string, Set<string>>());
  readonly ugDescendantMap = signal(new Map<string, Set<string>>());

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

  /**
   * Patch a single entity in the cached applications list (avoids a full refetch).
   * Returns true if the entity was found and updated.
   */
  updateEntityPartial(id: string, changes: Partial<ApplicationItem>): boolean {
    const apps = this.applications();
    const idx = apps.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    const updated = { ...apps[idx], ...changes };
    const next = [...apps];
    next[idx] = updated;
    this.applications.set(next);
    return true;
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
            const toMigrationTargetArray = (raw: any): Array<{ id: string; displayName: string; lifecycle?: string | null; proportion?: number | null; priority?: number | null; effort?: string | null; eta?: string | null; comments?: string | null }> => {
              if (!raw) return [];
              let items: any[];
              if (typeof raw === 'object' && !Array.isArray(raw) && raw.edges && Array.isArray(raw.edges)) {
                items = raw.edges;
              } else if (Array.isArray(raw)) {
                items = raw;
              } else {
                return [];
              }
              return items.map((r: any) => {
                let fs: any;
                let edgeProps: any;
                if (r?.node) {
                  fs = r.node.factSheet ?? {};
                  edgeProps = r;
                } else {
                  fs = r;
                  edgeProps = r;
                }
                return {
                  id: String(fs?.id ?? ''),
                  displayName: String(fs?.displayName ?? fs?.id ?? ''),
                  lifecycle: edgeProps?.lifecycle ?? null,
                  proportion: edgeProps?.proportion != null ? Number(edgeProps.proportion) : null,
                  priority: edgeProps?.priority != null ? Number(edgeProps.priority) : null,
                  effort: edgeProps?.effort ?? null,
                  eta: edgeProps?.eta ?? null,
                  comments: edgeProps?.comments ?? null,
                };
              });
            };
            const toAlternativesArray = (raw: any): Array<{ id: string; displayName: string; functionalOverlap?: number | null; comment?: string | null }> => {
              if (!raw) return [];
              let items: any[];
              if (typeof raw === 'object' && !Array.isArray(raw) && raw.edges && Array.isArray(raw.edges)) {
                items = raw.edges;
              } else if (Array.isArray(raw)) {
                items = raw;
              } else {
                return [];
              }
              return items.map((r: any) => {
                let fs: any;
                let edgeProps: any;
                if (r?.node) {
                  fs = r.node.factSheet ?? {};
                  edgeProps = r;
                } else {
                  fs = r;
                  edgeProps = r;
                }
                return {
                  id: String(fs?.id ?? ''),
                  displayName: String(fs?.displayName ?? fs?.id ?? ''),
                  functionalOverlap: edgeProps?.functionalOverlap != null ? Number(edgeProps.functionalOverlap) : null,
                  comment: edgeProps?.comment ?? null,
                };
              });
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
            base.earmarkingsTEMP = (e as any).earmarkingsTEMP ?? null;
            base.description = (e as any).description ?? null;
            base.relApplicationToBusinessCapability = toRelationArray(rawCaps);
            base.relApplicationToUserGroup = toRelationArray((e as any).relApplicationToUserGroup);
            base.relApplicationToDataProduct = toRelationArray((e as any).relApplicationToDataProduct);
            base.migrationTarget = toMigrationTargetArray((e as any).migrationTarget);
            base.alternatives = toAlternativesArray((e as any).alternatives);
            base.ApplicationLifecycle = (e as any).ApplicationLifecycle ?? null;
            base.tags = this.extractTags((e as any).tags);
            return base;
          })
        );
        this.loading.set(false);
        this.buildDescendantMaps();
      },
      error: () => {
        if (seq !== this.loadSeq) return;
        this.applications.set([]);
        this.loading.set(false);
      },
    });
  }

  private buildDescendantMaps(): void {
    let bcItems: any[] = [];
    let ugItems: any[] = [];
    let bcDone = false;
    let ugDone = false;

    const tryPopulate = () => {
      if (!bcDone || !ugDone) return;
      const bcMap = new Map<string, Set<string>>();
      const ugMap = new Map<string, Set<string>>();
      this.populateDescendantMap(bcItems, bcMap);
      this.populateDescendantMap(ugItems, ugMap);
      this.bcDescendantMap.set(bcMap);
      this.ugDescendantMap.set(ugMap);
    };

    this.entityApi.listBusinessCapabilities().subscribe({
      next: (body: any) => {
        bcItems = Array.isArray(body) ? body : (body?.businessCapabilities ?? []);
        bcDone = true;
        tryPopulate();
      },
      error: () => { bcDone = true; tryPopulate(); },
    });
    this.entityApi.listUserGroups().subscribe({
      next: (body: any) => {
        ugItems = Array.isArray(body) ? body : (body?.userGroups ?? []);
        ugDone = true;
        tryPopulate();
      },
      error: () => { ugDone = true; tryPopulate(); },
    });
  }

  private populateDescendantMap(items: any[], targetMap: Map<string, Set<string>>): void {
    const childrenOf = new Map<string, string[]>();
    for (const item of items) {
      const parents: string[] = item.parentIds ?? [];
      for (const pid of parents) {
        if (!childrenOf.has(pid)) childrenOf.set(pid, []);
        childrenOf.get(pid)!.push(item.id);
      }
    }
    for (const item of items) {
      const descendants = new Set<string>([item.id]);
      const stack = [item.id];
      while (stack.length > 0) {
        const current = stack.pop()!;
        for (const child of childrenOf.get(current) ?? []) {
          if (!descendants.has(child)) {
            descendants.add(child);
            stack.push(child);
          }
        }
      }
      targetMap.set(item.id, descendants);
    }
  }

  /** Compute how many applications reference each entity (including descendants). */
  getMatchCounts(
    items: Array<{ id: string }>,
    relationKey: 'relApplicationToBusinessCapability' | 'relApplicationToUserGroup',
    descendantMap: Map<string, Set<string>>
  ): Map<string, number> {
    const counts = new Map<string, number>();
    const apps = this.applications();
    for (const item of items) {
      const matchIds = descendantMap.get(item.id) ?? new Set([item.id]);
      let count = 0;
      for (const app of apps) {
        const rel = app[relationKey];
        if (Array.isArray(rel) && rel.some((r: any) => matchIds.has(r.id))) {
          count++;
        }
      }
      counts.set(item.id, count);
    }
    return counts;
  }

  /** Apply all filters except the specified relation key, returning the base set for faceted counts. */
  applyFiltersExcept(filters: Record<string, any>, excludeKey: string): ApplicationItem[] {
    const partial = { ...filters };
    delete partial[excludeKey];
    return this.applyFilters(partial);
  }

  /** Compute facet counts for a relation, excluding its own filter. */
  getFacetCounts(
    items: Array<{ id: string }>,
    relationKey: string,
    descendantMap: Map<string, Set<string>>,
    filters: Record<string, any>,
    mode: 'subtree' | 'exact' = 'subtree'
  ): Map<string, number> {
    const base = this.applyFiltersExcept(filters, relationKey);
    const counts = new Map<string, number>();
    for (const item of items) {
      let count = 0;
      for (const app of base) {
        const rel = (app as any)[relationKey];
        if (mode === 'exact') {
          if (Array.isArray(rel) && rel.some((r: any) => r.id === item.id)) {
            count++;
          }
        } else {
          const matchIds = descendantMap.get(item.id) ?? new Set([item.id]);
          if (Array.isArray(rel) && rel.some((r: any) => matchIds.has(r.id))) {
            count++;
          }
        }
      }
      counts.set(item.id, count);
    }
    return counts;
  }

  /** Compute facet counts for a flat relation (no hierarchy), excluding its own filter. */
  getFlatFacetCounts(
    items: Array<{ id: string }>,
    relationKey: string,
    filters: Record<string, any>
  ): Map<string, number> {
    const base = this.applyFiltersExcept(filters, relationKey);
    const counts = new Map<string, number>();
    for (const item of items) {
      let count = 0;
      for (const app of base) {
        const rel = (app as any)[relationKey];
        if (Array.isArray(rel) && rel.some((r: any) => r.id === item.id)) {
          count++;
        }
      }
      counts.set(item.id, count);
    }
    return counts;
  }

  /** Compute option counts for a simple filter, excluding its own filter. */
  getFilterOptionCounts(
    filterKey: string,
    optionValues: string[],
    filters: Record<string, any>,
    matcher: (app: ApplicationItem, value: string) => boolean
  ): Map<string, number> {
    const base = this.applyFiltersExcept(filters, filterKey);
    const counts = new Map<string, number>();
    for (const val of optionValues) {
      let count = 0;
      for (const app of base) {
        if (matcher(app, val)) { count++; }
      }
      counts.set(val, count);
    }
    return counts;
  }

  filterByName(nameText: string): ApplicationItem[] {
    const q = (nameText ?? '').trim();
    if (!q) return this.applications();
    return this.applications().filter((app) => {
      const nameAndEarmarkings = [app.displayName, app['earmarkingsTEMP'] ?? ''].filter(Boolean).join(' ');
      if (matchesSearch(q, nameAndEarmarkings)) return true;
      if (app.relApplicationToBusinessCapability?.some((c) => matchesSearch(q, c.displayName))) return true;
      if (app.relApplicationToUserGroup?.some((g) => matchesSearch(q, g.displayName ?? g.fullName ?? ''))) return true;
      if (app.relApplicationToDataProduct?.some((p) => matchesSearch(q, p.displayName ?? p.fullName ?? ''))) return true;
      const serializeTargets = (targets: unknown) =>
        Array.isArray(targets) ? targets.map((m: any) => m?.displayName ?? '').join(' ') : '';
      if (app.migrationTarget && matchesSearch(q, serializeTargets(app.migrationTarget))) return true;
      if (app.alternatives && matchesSearch(q, serializeTargets(app.alternatives))) return true;
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

  filterByBusinessCapability(id: string, mode: 'subtree' | 'exact' = 'subtree'): ApplicationItem[] {
    if (!id) return this.applications();
    if (mode === 'exact') {
      return this.applications().filter(
        (e) => e.relApplicationToBusinessCapability?.some((c) => c.id === id)
      );
    }
    const matchIds = this.bcDescendantMap().get(id) ?? new Set([id]);
    return this.applications().filter(
      (e) => e.relApplicationToBusinessCapability?.some((c) => matchIds.has(c.id))
    );
  }

  filterByUserGroup(id: string, mode: 'subtree' | 'exact' = 'subtree'): ApplicationItem[] {
    if (!id) return this.applications();
    if (mode === 'exact') {
      return this.applications().filter(
        (e) => e.relApplicationToUserGroup?.some((g) => g.id === id)
      );
    }
    const matchIds = this.ugDescendantMap().get(id) ?? new Set([id]);
    return this.applications().filter(
      (e) => e.relApplicationToUserGroup?.some((g) => matchIds.has(g.id))
    );
  }

  filterByDataProduct(id: string): ApplicationItem[] {
    if (!id) return this.applications();
    return this.applications().filter(
      (e) => e.relApplicationToDataProduct?.some((p) => p.id === id)
    );
  }

  filterByProject(id: string): ApplicationItem[] {
    if (!id) return this.applications();
    return this.applications().filter(
      (e) => (e as any).relApplicationToProject?.some((p: any) => p.id === id)
    );
  }

  applyFilters(filters: {
    name?: string;
    status?: string;
    technicalSuitability?: string;
    functionalSuitability?: string;
    lxTimeClassification?: string;
    northStarClassification?: string;
    businessCriticality?: string;
    applicationLifecycle?: string;
    relApplicationToBusinessCapability?: string;
    relApplicationToBusinessCapabilityMode?: 'subtree' | 'exact';
    relApplicationToUserGroup?: string;
    relApplicationToUserGroupMode?: 'subtree' | 'exact';
    relApplicationToProject?: string;
    relApplicationToDataProduct?: string;
    tags?: string[];
    customFields?: Record<string, string>;
  }): ApplicationItem[] {
    let result = this.filterByName(filters.name ?? '');
    if (filters.status) {
      result = result.filter((a) => ((a as any).status ?? 'ACTIVE') === filters.status);
    }
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
    if (filters.applicationLifecycle) {
      result = result.filter((a) => a.ApplicationLifecycle?.asString === filters.applicationLifecycle);
    }
    if (filters.relApplicationToBusinessCapability) {
      const filtered = this.filterByBusinessCapability(
        filters.relApplicationToBusinessCapability,
        filters.relApplicationToBusinessCapabilityMode
      );
      result = result.filter((a) => filtered.includes(a));
    }
    if (filters.relApplicationToUserGroup) {
      const filtered = this.filterByUserGroup(
        filters.relApplicationToUserGroup,
        filters.relApplicationToUserGroupMode
      );
      result = result.filter((a) => filtered.includes(a));
    }
    if (filters.relApplicationToProject) {
      const filtered = this.filterByProject(filters.relApplicationToProject);
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

  /** Compute facet counts for a custom field's option values, excluding that field's own filter. */
  getCustomFieldOptionCounts(
    fieldName: string,
    optionValues: string[],
    filters: Record<string, any>
  ): Map<string, number> {
    const partial = { ...filters };
    if (partial['customFields']) {
      const cf = { ...partial['customFields'] };
      delete cf[fieldName];
      partial['customFields'] = cf;
    }
    const base = this.applyFilters(partial);
    const counts = new Map<string, number>();
    for (const val of optionValues) {
      let count = 0;
      for (const app of base) {
        const entityVal = (app as unknown as Record<string, unknown>)[fieldName];
        if (entityVal == null) continue;
        if (Array.isArray(entityVal)) {
          if (entityVal.includes(val)) { count++; }
        } else {
          if (String(entityVal) === val) { count++; }
        }
      }
      counts.set(val, count);
    }
    return counts;
  }

  resolveDynamicConditions(conditions: DynamicFilterCondition[]): ApplicationItem[] {
    if (!conditions || conditions.length === 0) return [];
    const matchedIds = new Set<string>();
    for (const condition of conditions) {
      const filters = this.conditionToFilters(condition);
      const matches = this.applyFilters(filters);
      for (const app of matches) {
        matchedIds.add(app.id);
      }
    }
    return this.applications().filter(a => matchedIds.has(a.id));
  }

  private conditionToFilters(condition: DynamicFilterCondition): Record<string, any> {
    const filters: Record<string, any> = {};
    for (const [key, value] of Object.entries(condition)) {
      if (value == null) continue;
      if (typeof value === 'string') {
        switch (key) {
          case 'status': filters['status'] = value; break;
          case 'displayName': filters['name'] = value; break;
          case 'technicalSuitability': filters['technicalSuitability'] = value; break;
          case 'functionalSuitability': filters['functionalSuitability'] = value; break;
          case 'businessCriticality': filters['businessCriticality'] = value; break;
          case 'lxTimeClassification': filters['lxTimeClassification'] = value; break;
          case 'northStarClassification': filters['northStarClassification'] = value; break;
          case 'ApplicationLifecycle': filters['applicationLifecycle'] = value; break;
          default:
            if (!filters['customFields']) filters['customFields'] = {};
            filters['customFields'][key] = value;
            break;
        }
      } else if (typeof value === 'object' && 'id' in value) {
        if (key === 'relApplicationToBusinessCapability') {
          filters['relApplicationToBusinessCapability'] = value.id;
          filters['relApplicationToBusinessCapabilityMode'] = value.mode ?? 'subtree';
        }
      }
    }
    return filters;
  }
}
