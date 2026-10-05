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
import { BcTreeService } from './bc-tree.service';
import { UserConfigService } from './user-config.service';
import { ModelDefinitionsService, type CustomFieldDefinition } from './model-definitions.service';
import { VirtualAttributeService } from './virtual-attribute.service';
import { matchesSearch } from '../utils/search-utils';
import { extractParentIds } from '../utils/parent-utils';
import { readRelationItems, RelationData } from '../utils/relation-data';
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
  relApplicationToBusinessCapability?: RelationData;
  relApplicationToUserGroup?: RelationData;
  relApplicationToDataProduct?: RelationData;
  relApplicationToPlatform?: RelationData;
  relApplicationToProject?: RelationData;
  migrationTarget?: Array<{ id: string; displayName: string; lifecycle?: string | null; proportion?: number | null; priority?: number | null; effort?: string | null; benefit?: string | null; eta?: string | null; comments?: string | null; startDate?: string | null; endDate?: string | null; projectReference?: string | null; userGroup?: Array<{ id: string; displayName: string; fullName?: string }> | null }>;
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

  /** Cached virtual field definitions (populated after first model definitions fetch). */
  private virtualDefs: Record<string, CustomFieldDefinition> | null = null;

  /** Pre-computed: for each entity ID, the set of all descendant IDs (including itself). */
  readonly bcDescendantMap = signal(new Map<string, Set<string>>());
  readonly ugDescendantMap = signal(new Map<string, Set<string>>());

  constructor(
    private entityApi: EntityApiService,
    private bcTree: BcTreeService,
    private userConfig: UserConfigService,
    private modelDefinitionsService: ModelDefinitionsService,
    private virtualAttributeService: VirtualAttributeService,
  ) {
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
    if (this.virtualDefs && Object.keys(this.virtualDefs).length > 0) {
      this.virtualAttributeService.computeVirtualAttributes(updated as Record<string, unknown>, this.virtualDefs);
    }
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
            const capabilityNames: string[] = readRelationItems((e as any).relApplicationToBusinessCapability)
              .map((c) => c.displayName)
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            const toMigrationTargetArray = (raw: any): Array<{ id: string; displayName: string; lifecycle?: string | null; proportion?: number | null; priority?: number | null; effort?: string | null; benefit?: string | null; eta?: string | null; comments?: string | null; startDate?: string | null; endDate?: string | null; projectReference?: string | null; userGroup?: Array<{ id: string; displayName: string; fullName?: string }> | null }> => {
              if (!raw) return [];
              let items: any[];
              if (typeof raw === 'object' && !Array.isArray(raw) && raw.edges && Array.isArray(raw.edges)) {
                items = raw.edges;
              } else if (Array.isArray(raw)) {
                items = raw;
              } else {
                return [];
              }
              const parseUserGroupEdges = (ugRaw: any): Array<{ id: string; displayName: string; fullName?: string }> | null => {
                if (!ugRaw) return null;
                let ugItems: any[];
                if (typeof ugRaw === 'object' && !Array.isArray(ugRaw) && ugRaw.edges && Array.isArray(ugRaw.edges)) {
                  ugItems = ugRaw.edges;
                } else if (Array.isArray(ugRaw)) {
                  ugItems = ugRaw;
                } else {
                  return null;
                }
                const result = ugItems.map((u: any) => {
                  const ufs = u?.node?.factSheet ?? u;
                  return {
                    id: String(ufs?.id ?? ''),
                    displayName: String(ufs?.displayName ?? ufs?.fullName ?? ufs?.id ?? ''),
                    fullName: ufs?.fullName != null ? String(ufs.fullName) : undefined,
                  };
                }).filter((u: any) => u.id !== '');
                return result.length > 0 ? result : null;
              };
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
                  benefit: edgeProps?.benefit ?? null,
                  eta: edgeProps?.eta ?? null,
                  comments: edgeProps?.comments ?? null,
                  startDate: edgeProps?.startDate ?? null,
                  endDate: edgeProps?.endDate ?? null,
                  projectReference: edgeProps?.projectReference ?? null,
                  userGroup: parseUserGroupEdges(edgeProps?.userGroup),
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
            // Start with ALL fields from the API response (preserves custom fields).
            // Relation fields keep their raw wire shape (RelationData); consumer code reads via readRelationItems().
            const base = { ...(e as any) };
            base.id = String((e as any).id ?? '');
            base.displayName = String((e as any).displayName ?? '');
            base.capabilityNames = capabilityNames;
            base.technicalSuitability = (e as any).technicalSuitability ?? null;
            base.functionalSuitability = (e as any).functionalSuitability ?? null;
            base.businessCriticality = (e as any).businessCriticality ?? null;
            base.earmarkingsTEMP = (e as any).earmarkingsTEMP ?? null;
            base.description = (e as any).description ?? null;
            base.relApplicationToBusinessCapability = (e as any).relApplicationToBusinessCapability;
            base.relApplicationToUserGroup = (e as any).relApplicationToUserGroup;
            base.relApplicationToDataProduct = (e as any).relApplicationToDataProduct;
            base.relApplicationToPlatform = (e as any).relApplicationToPlatform;
            base.relApplicationToProject = (e as any).relApplicationToProject;
            base.migrationTarget = toMigrationTargetArray((e as any).migrationTarget);
            base.alternatives = toAlternativesArray((e as any).alternatives);
            base.ApplicationLifecycle = (e as any).ApplicationLifecycle ?? null;
            base.tags = this.extractTags((e as any).tags);
            return base;
          })
        );
        this.loading.set(false);
        this.buildDescendantMaps();
        this.computeVirtualFields();
      },
      error: () => {
        if (seq !== this.loadSeq) return;
        this.applications.set([]);
        this.loading.set(false);
      },
    });
  }

  private buildDescendantMaps(): void {
    let ugItems: any[] = [];
    let ugDone = false;

    const tryPopulate = () => {
      if (!ugDone) return;
      // BC descendant map comes from BcTreeService (single source of truth)
      const bcMap = new Map<string, Set<string>>();
      for (const [id, descSet] of this.bcTree.descendantMap()) {
        bcMap.set(id, descSet);
      }
      this.bcDescendantMap.set(bcMap);
      // UG descendant map still computed here
      const ugMap = new Map<string, Set<string>>();
      this.populateDescendantMap(ugItems, ugMap);
      this.ugDescendantMap.set(ugMap);
    };

    this.bcTree.load();
    if (this.bcTree.loaded()) {
      // Already loaded, populate immediately
      const bcMap = new Map<string, Set<string>>();
      for (const [id, descSet] of this.bcTree.descendantMap()) {
        bcMap.set(id, descSet);
      }
      this.bcDescendantMap.set(bcMap);
    } else {
      // Wait for service to load
      const interval = setInterval(() => {
        if (this.bcTree.loaded()) {
          clearInterval(interval);
          const bcMap = new Map<string, Set<string>>();
          for (const [id, descSet] of this.bcTree.descendantMap()) {
            bcMap.set(id, descSet);
          }
          this.bcDescendantMap.set(bcMap);
        }
      }, 50);
    }

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
      const parents: string[] = extractParentIds(item.relToParent);
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

  /** Fetch model definitions and compute virtual field values for all loaded applications. */
  private computeVirtualFields(): void {
    this.modelDefinitionsService.getModelDefinitions().subscribe({
      next: (definitions) => {
        const appDef = definitions['Application'];
        const allFields = appDef?.customFields ?? {};
        const virtualDefs: Record<string, CustomFieldDefinition> = {};
        for (const [key, def] of Object.entries(allFields)) {
          if (def.type === 'virtual' && def.formula) {
            virtualDefs[key] = def;
          }
        }
        this.virtualDefs = Object.keys(virtualDefs).length > 0 ? virtualDefs : null;
        if (!this.virtualDefs) return;
        const apps = this.applications();
        const updated = apps.map((app) => {
          const copy = { ...app } as Record<string, unknown>;
          this.virtualAttributeService.computeVirtualAttributes(copy, this.virtualDefs!);
          return copy as ApplicationItem;
        });
        this.applications.set(updated);
      },
      error: () => { /* ignore – virtual fields simply remain unset */ },
    });
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
        const items = readRelationItems(app[relationKey]);
        if (items.some((r) => matchIds.has(r.id))) {
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
        const relItems = readRelationItems((app as any)[relationKey]);
        if (mode === 'exact') {
          if (relItems.some((r) => r.id === item.id)) {
            count++;
          }
        } else {
          const matchIds = descendantMap.get(item.id) ?? new Set([item.id]);
          if (relItems.some((r) => matchIds.has(r.id))) {
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
        const relItems = readRelationItems((app as any)[relationKey]);
        if (relItems.some((r) => r.id === item.id)) {
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

  /** Compute facet counts for the migration filter, excluding its own filter. */
  getMigrationFilterOptionCounts(
    optionValues: string[],
    filters: Record<string, any>
  ): Map<string, number> {
    const base = this.applyFiltersExcept(filters, 'migrationFilter');
    const counts = new Map<string, number>();
    for (const val of optionValues) {
      let count = 0;
      if (val === 'from') {
        count = base.filter((app) => Array.isArray(app.migrationTarget) && app.migrationTarget.length > 0).length;
      } else if (val === 'to') {
        const targetIds = new Set<string>();
        for (const app of base) {
          if (Array.isArray(app.migrationTarget)) {
            for (const mt of app.migrationTarget) {
              if (mt.id) targetIds.add(mt.id);
            }
          }
        }
        count = base.filter((app) => targetIds.has(app.id)).length;
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
      if (readRelationItems(app.relApplicationToBusinessCapability).some((c) => matchesSearch(q, c.displayName))) return true;
      if (readRelationItems(app.relApplicationToUserGroup).some((g) => matchesSearch(q, g.displayName ?? g.fullName ?? ''))) return true;
      if (readRelationItems(app.relApplicationToDataProduct).some((p) => matchesSearch(q, p.displayName ?? p.fullName ?? ''))) return true;
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
        (e) => readRelationItems(e.relApplicationToBusinessCapability).some((c) => c.id === id)
      );
    }
    const matchIds = this.bcDescendantMap().get(id) ?? new Set([id]);
    return this.applications().filter(
      (e) => readRelationItems(e.relApplicationToBusinessCapability).some((c) => matchIds.has(c.id))
    );
  }

  filterByUserGroup(id: string, mode: 'subtree' | 'exact' = 'subtree'): ApplicationItem[] {
    if (!id) return this.applications();
    if (mode === 'exact') {
      return this.applications().filter(
        (e) => readRelationItems(e.relApplicationToUserGroup).some((g) => g.id === id)
      );
    }
    const matchIds = this.ugDescendantMap().get(id) ?? new Set([id]);
    return this.applications().filter(
      (e) => readRelationItems(e.relApplicationToUserGroup).some((g) => matchIds.has(g.id))
    );
  }

  filterByDataProduct(id: string): ApplicationItem[] {
    if (!id) return this.applications();
    return this.applications().filter(
      (e) => readRelationItems(e.relApplicationToDataProduct).some((p) => p.id === id)
    );
  }

  filterByProject(id: string): ApplicationItem[] {
    if (!id) return this.applications();
    return this.applications().filter(
      (e) => readRelationItems((e as any).relApplicationToProject).some((p) => p.id === id)
    );
  }

  filterByMigration(value: 'from' | 'to'): ApplicationItem[] {
    if (!value) return this.applications();
    const allApps = this.applications();
    if (value === 'from') {
      return allApps.filter((app) => Array.isArray(app.migrationTarget) && app.migrationTarget.length > 0);
    }
    const targetIds = new Set<string>();
    for (const app of allApps) {
      if (Array.isArray(app.migrationTarget)) {
        for (const mt of app.migrationTarget) {
          if (mt.id) targetIds.add(mt.id);
        }
      }
    }
    return allApps.filter((app) => targetIds.has(app.id));
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
    migrationFilter?: string;
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
    if (filters.migrationFilter && (filters.migrationFilter === 'from' || filters.migrationFilter === 'to')) {
      const filtered = this.filterByMigration(filters.migrationFilter as 'from' | 'to');
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
