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

import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSliderModule } from '@angular/material/slider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
import { EntityApiService } from '../../services/entity-api.service';
import { ListEntities200ResponseInner } from '../../services/api/model/listEntities200ResponseInner';
import { TranslatePipe } from '@ngx-translate/core';
import { ApplicationsService } from '../../services/ApplicationsService';
import { JaccardService } from '../../services/jaccard.service';
import type { ReferenceEditorDialogData, ReferenceEditorItem, ReferenceTargetType } from '../../models/reference-editor-item';
import { matchesSearch } from '../../utils/search-utils';
import type { FacetTreeOption } from '../../utils/facet-tree-utils';
import type { FacetRelationItem } from '../../services/FacetsService';
import { BcTreeService } from '../../services/bc-tree.service';

@Component({
  selector: 'app-reference-editor-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatCheckboxModule,
    MatSliderModule,
    MatSnackBarModule,
    TranslatePipe,
  ],
  templateUrl: './reference-editor-dialog.component.html',
  styleUrl: './reference-editor-dialog.component.scss',
})
export class ReferenceEditorDialogComponent {
  private dialogRef = inject(MatDialogRef<ReferenceEditorDialogComponent>);
  private data = inject<ReferenceEditorDialogData>(MAT_DIALOG_DATA);
  private entityApi = inject(EntityApiService);
  private jaccardService = inject(JaccardService);
  private applicationsService = inject(ApplicationsService);
  private snackBar = inject(MatSnackBar);
  private bcTree = inject(BcTreeService);

  readonly targetType = this.data.targetType as ReferenceTargetType;

  /** Full BC list with relToParent — when provided, child tree is shown. */
  private readonly allBcs = this.data.allBusinessCapabilities ?? [];
  readonly hasChildTree = this.allBcs.length > 0;

  /** Map BC id → status for quick lookup. */
  private readonly bcStatusMap = new Map(this.allBcs.map((b) => [b.id, b.status ?? 'ACTIVE']));

  /**
   * Set of BC IDs that are NOT actively reachable — i.e. they have no ACTIVE
   * ancestor path from root. These should be struck through in the UI.
   */
  readonly effectivelyArchivedIds = computed(() => this.bcTree.activelyReachableIds());

  /** Map parentId → single-parented children (exactly one parent in relToParent). */
  private readonly childMap = new Map<string, ReferenceEditorItem[]>();

  /** IDs of child BCs that are checked in the subtree view. */
  readonly checkedChildren = signal<Set<string>>(new Set());

  /** Parent IDs whose checkbox was unchecked because a child was selected (auto). */
  readonly overriddenParents = signal<Set<string>>(new Set());

  /** Parent IDs whose checkbox was unchecked by the user (manual). */
  readonly userUnchecked = signal<Set<string>>(new Set());

  /** Dialog title. */
  readonly dialogTitle = this.targetType === 'BusinessCapability'
    ? 'Manage Business Capabilities'
    : `Link to ${this.targetType}`;

  readonly searchCtrl = new FormControl<string>('', { nonNullable: true });
  private readonly searchValue = toSignal(this.searchCtrl.valueChanges.pipe(startWith('')), { initialValue: '' });

  readonly selection = signal<ReferenceEditorItem[]>([]);
  readonly entities = signal<ReferenceEditorItem[]>([]);
  readonly loading = signal<boolean>(false);
  readonly creating = signal<boolean>(false);
  readonly newEntityName = signal<string>('');

  // ── Expand-collapse state (Add section tree) ──────────────────
  private static readonly LS_KEY = 'zenea-ref-editor-dialog-expanded-bcs';
  /** Manually expanded node IDs — persisted to localStorage. */
  readonly manuallyExpanded = signal<Set<string>>(ReferenceEditorDialogComponent.loadExpandedFromStorage());
  /** Auto-expanded node IDs (from filter, not persisted). */
  readonly autoExpanded = signal<Set<string>>(new Set());

  private static loadExpandedFromStorage(): Set<string> {
    try {
      const raw = localStorage.getItem(ReferenceEditorDialogComponent.LS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === 'string'));
      }
    } catch { /* ignore */ }
    return new Set();
  }

  private persistExpanded(ids: Set<string>): void {
    try {
      localStorage.setItem(ReferenceEditorDialogComponent.LS_KEY, JSON.stringify([...ids]));
    } catch { /* ignore */ }
  }

  constructor() {
    const initial = Array.isArray(this.data?.currentSelection) ? this.data.currentSelection : [];
    this.selection.set(
      initial
        .filter((it) => it && typeof it === 'object' && typeof it.id === 'string' && it.id.length > 0)
        .map((it) => ({
          ...it,
          type: this.targetType,
          displayName: typeof it.displayName === 'string' ? it.displayName : it.id,
        }))
    );

    this.loading.set(true);
    this.loadEntities();

    // Build single-parented child map from service
    if (this.allBcs.length) {
      const singleParentMap = this.bcTree.getSingleParentChildren();
      for (const [parentId, children] of singleParentMap) {
        this.childMap.set(parentId, children.map((bc) => ({
          id: bc.id,
          type: 'BusinessCapability' as const,
          displayName: bc.displayName,
          fullName: bc.displayName,
          description: undefined,
        })));
      }
    }

    // Auto-expand ancestor paths when filter is active; clear when filter is removed.
    effect(() => {
      const q = (this.searchValue() ?? '').trim();
      if (!q) { this.autoExpanded.set(new Set()); return; }

      const tree = this.availableToAddTree();
      const expandable = this.expandableNodeIds();
      const auto = new Set<string>();

      // Index: trackId → node for parentId walk
      const byTrackId = new Map<string, FacetTreeOption>();
      for (const opt of tree) {
        const key = opt.trackId ?? opt.id;
        byTrackId.set(key, opt);
      }

      for (const opt of tree) {
        const name = opt.label ?? '';
        if (!matchesSearch(q, name)) continue;
        // Walk up the parentId chain, expanding each ancestor
        let parentId: string | undefined = opt.parentId;
        while (parentId) {
          if (expandable.has(parentId)) {
            auto.add(parentId);
          }
          const parentNode = byTrackId.get(parentId);
          parentId = parentNode?.parentId;
        }
      }
      this.autoExpanded.set(auto);
    });
  }

  private loadEntities(): void {
    if (this.targetType === 'BusinessCapability') {
      this.entityApi.listBusinessCapabilities().subscribe({
        next: (list) => {
          this.entities.set(this.mapBusinessCapabilitiesToReferenceItems(list));
          this.resolveSelectionLabels(this.entities());
        },
        error: () => {
          this.entities.set([]);
          this.loading.set(false);
        },
        complete: () => this.loading.set(false),
      });
    } else if (this.targetType === 'DataProduct') {
      this.entityApi.listDataProducts().subscribe({
        next: (list) => {
          this.entities.set(this.mapDataProductsToReferenceItems(list));
          this.resolveSelectionLabels(this.entities());
        },
        error: () => {
          this.entities.set([]);
          this.loading.set(false);
        },
        complete: () => this.loading.set(false),
      });
    } else if (this.targetType === 'UserGroup') {
      this.entityApi.listUserGroups().subscribe({
        next: (list) => {
          this.entities.set(this.mapUserGroupsToReferenceItems(list));
          this.resolveSelectionLabels(this.entities());
        },
        error: () => {
          this.entities.set([]);
          this.loading.set(false);
        },
        complete: () => this.loading.set(false),
      });
    } else if (this.targetType === 'Platform') {
      this.entityApi.listPlatforms().subscribe({
        next: (list) => this.entities.set(this.mapPlatformsToReferenceItems(list)),
        error: () => {
          this.entities.set([]);
          this.loading.set(false);
        },
        complete: () => this.loading.set(false),
      });
    } else if (this.targetType === 'Application') {
      this.applicationsService.ensureLoaded();
      effect(() => {
        const apps = this.applicationsService.applications();
        const loading = this.applicationsService.loading();
        this.entities.set(
          apps.map((a) => ({
            id: a.id,
            type: 'Application' as ReferenceTargetType,
            displayName: a.displayName,
            fullName: a.displayName,
            description: undefined,
            capabilityNames: a.capabilityNames,
          }))
        );
        this.loading.set(loading);
      });
    } else {
      this.entityApi.listEntitiesByType(this.targetType).subscribe({
        next: (list) => this.entities.set(this.mapListEntitiesToReferenceItems(list)),
        error: () => {
          this.entities.set([]);
          this.loading.set(false);
        },
        complete: () => this.loading.set(false),
      });
    }
  }

  /** After the full entity list is loaded, update selection items to use the canonical displayName from the entity list (by GUID), falling back to persisted inline data. */
  private resolveSelectionLabels(entities: ReferenceEditorItem[]): void {
    if (entities.length === 0) return;
    const lookup = new Map(entities.map((e) => [e.id, e.displayName]));
    this.selection.update((sel) =>
      sel.map((s) => {
        const canonical = lookup.get(s.id);
        return canonical ? { ...s, displayName: canonical } : s;
      })
    );
  }

  private mapBusinessCapabilitiesToReferenceItems(list: unknown): ReferenceEditorItem[] {
    let items: { id: string; displayName: string; status?: string }[] = [];
    if (Array.isArray(list)) {
      items = list;
    } else if (list && typeof list === 'object' && 'businessCapabilities' in list) {
      items = (list as { businessCapabilities?: { id: string; displayName: string; status?: string }[] }).businessCapabilities ?? [];
    }
    return items
      .map((e) => ({
        id: e.id,
        type: this.targetType,
        displayName: e.displayName,
        fullName: e.displayName,
        description: undefined,
        status: e.status,
      }))
      .filter((x) => x.id.length > 0);
  }

  private mapUserGroupsToReferenceItems(list: unknown): ReferenceEditorItem[] {
    let items: { id: string; displayName: string }[] = [];
    if (Array.isArray(list)) {
      items = list;
    } else if (list && typeof list === 'object' && 'userGroups' in list) {
      items = (list as { userGroups?: { id: string; displayName: string }[] }).userGroups ?? [];
    }
    return items
      .map((e) => ({
        id: e.id,
        type: this.targetType,
        displayName: e.displayName,
        fullName: e.displayName,
        description: undefined,
      }))
      .filter((x) => x.id.length > 0);
  }

  private mapPlatformsToReferenceItems(list: unknown): ReferenceEditorItem[] {
    let items: { id: string; displayName: string }[] = [];
    if (Array.isArray(list)) {
      items = list;
    } else if (list && typeof list === 'object' && 'platforms' in list) {
      items = (list as { platforms?: { id: string; displayName: string }[] }).platforms ?? [];
    }
    return items
      .map((e) => ({
        id: e.id,
        type: this.targetType,
        displayName: e.displayName,
        fullName: e.displayName,
        description: undefined,
      }))
      .filter((x) => x.id.length > 0);
  }

  private mapDataProductsToReferenceItems(list: unknown): ReferenceEditorItem[] {
    let items: { id: string; displayName: string }[] = [];
    if (Array.isArray(list)) {
      items = list;
    } else if (list && typeof list === 'object' && 'dataProducts' in list) {
      items = (list as { dataProducts?: { id: string; displayName: string }[] }).dataProducts ?? [];
    }
    return items
      .map((e) => ({
        id: e.id,
        type: this.targetType,
        displayName: e.displayName,
        fullName: e.displayName,
        description: undefined,
      }))
      .filter((x) => x.id.length > 0);
  }

  private mapListEntitiesToReferenceItems(list: ListEntities200ResponseInner[]): ReferenceEditorItem[] {
    if (!Array.isArray(list)) return [];
    return list
      .map((e) => {
        const id = typeof e.id === 'string' ? e.id : '';
        const displayName =
          typeof e.displayName === 'string' && e.displayName.trim().length > 0
            ? e.displayName
            : typeof e.id === 'string'
              ? e.id
              : '';
        return {
          id,
          type: this.targetType,
          displayName,
          fullName: displayName,
          description: typeof (e as any).description === 'string' ? (e as any).description : undefined,
        };
      })
      .filter((x) => x.id.length > 0);
  }

  readonly availableToAdd = computed(() => {
    const q = (this.searchValue() ?? '').trim();
    const selectedIds = new Set(this.selection().map((s) => s.id));

    // Exclude child BCs that appear in the subtree
    const subtreeIds = new Set<string>();
    if (this.hasChildTree) {
      for (const bc of this.selection()) {
        for (const desc of this.getDescendants(bc.id)) {
          subtreeIds.add(desc.id);
        }
      }
    }

    let list = this.entities().filter((e) => !selectedIds.has(e.id) && !subtreeIds.has(e.id) && this.bcStatusMap.get(e.id) !== 'ARCHIVED');
    if (q) {
      list = list.filter((e) => matchesSearch(q, e.displayName) || matchesSearch(q, e.description ?? ''));
    }
    const capsToMatch = this.data?.capabilitiesToMatch;
    if (this.targetType === 'Application' && capsToMatch && capsToMatch.length > 0) {
      const refSet = new Set<string>(capsToMatch);
      return list
        .map((e) => ({
          ...e,
          similarity: this.jaccardService.similarity(refSet, new Set(e.capabilityNames ?? [])),
        }))
        .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0) || a.displayName.localeCompare(b.displayName));
    }
    return list.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
  });

  /** Hierarchical tree of ALL BCs — selected ones remain visible with checkboxes. */
  readonly availableToAddTree = computed(() => {
    if (!this.hasChildTree || this.targetType !== 'BusinessCapability') return [];

    const q = (this.searchValue() ?? '').trim();
    const fullTree = this.bcTree.buildFullTree(this.allBcs);
    const activeTree = this.bcTree.filterActiveOnly(fullTree);
    const filteredTree = q ? this.bcTree.filterByText(activeTree, q) : activeTree;
    return this.bcTree.flattenForDisplay(filteredTree);
  });

  /** IDs of synthetic parents (not real BCs from allBcs) — these should be hidden in the tree. */
  readonly syntheticParentIds = computed(() => new Set<string>());

  /** Set of currently selected BC IDs (for tree checkboxes). */
  readonly selectedTreeIds = computed(() => {
    return new Set(this.selection().map((s) => s.id));
  });

  /** Tree options annotated with hasChildren. parentId comes from FacetTreeOption. */
  readonly treeOptionsWithExpandable = computed(() => {
    const opts = this.availableToAddTree();
    const expandable = new Set<string>();
    for (let i = 0; i < opts.length; i++) {
      const depth = opts[i].depth;
      for (let j = i + 1; j < opts.length; j++) {
        if (opts[j].depth < depth) break;
        if (opts[j].depth === depth + 1) { expandable.add(opts[i].trackId ?? opts[i].id); break; }
      }
    }
    return opts.map((opt) => ({
      ...opt,
      hasChildren: expandable.has(opt.trackId ?? opt.id),
    }));
  });

  /** Set of node IDs that have children (expandable). */
  readonly expandableNodeIds = computed(() => {
    const set = new Set<string>();
    for (const opt of this.treeOptionsWithExpandable()) {
      if (opt.hasChildren) set.add(opt.trackId ?? opt.id);
    }
    return set;
  });

  /** Effective expanded state: manual ∪ auto when filtering. Always a fresh reference. */
  readonly expandedNodeIds = computed(() => {
    const manual = this.manuallyExpanded();
    const auto = this.autoExpanded();
    const merged = new Set(manual);
    for (const id of auto) merged.add(id);
    return merged;
  });

  /** Precomputed set of visible node IDs.
   *  A node is visible when its parentId is visible AND expanded.
   *  parentId is null for roots (always visible) or when parent is synthetic (always visible). */
  readonly visibleIds = computed(() => {
    const opts = this.treeOptionsWithExpandable();
    const expanded = this.expandedNodeIds();
    const synthetic = this.syntheticParentIds();
    const entityIds = new Set(this.entities().map((e) => e.id));
    const visible = new Set<string>();
    for (const opt of opts) {
      const key = opt.trackId ?? opt.id;
      if (opt.parentId == null) {
        visible.add(key);
        continue;
      }
      // Parent is synthetic (not a real entity) → treat as expanded
      if (synthetic.has(opt.parentId)) {
        visible.add(key);
        continue;
      }
      // Parent in tree and is a real entity → visible only if parent is visible and expanded
      if (visible.has(opt.parentId) && expanded.has(opt.parentId)) {
        visible.add(key);
      }
    }
    return visible;
  });

  /** Toggle expand/collapse for a tree node. Persists manual state. */
  toggleExpand(id: string): void {
    this.manuallyExpanded.update((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      this.persistExpanded(next);
      return next;
    });
  }

  isNodeExpanded(id: string): boolean {
    return this.expandedNodeIds().has(id);
  }

  /** Check if a BC is inactive (for cross-out styling in the selected section). */
  isBcArchived(id: string): boolean {
    return this.bcStatusMap.get(id) === 'ARCHIVED';
  }

  /** Returns true if a tree item should be hidden (synthetic parent node). */
  isTreeItemHidden(opt: { id: string; trackId?: string }): boolean {
    const key = opt.trackId ?? opt.id;
    return !this.visibleIds().has(key) || this.syntheticParentIds().has(opt.id);
  }

  /** Toggle selection of a BC from the tree checkbox. */
  toggleTreeSelection(opt: FacetTreeOption): void {
    const id = opt.id;
    if (this.selection().some((s) => s.id === id)) {
      this.selection.update((prev) => prev.filter((s) => s.id !== id));
    } else {
      const item = this.entities().find((e) => e.id === id);
      if (item) this.selection.update((prev) => [...prev, item]);
    }
  }

  add(item: ReferenceEditorItem): void {
    this.selection.update((prev) => prev.some((s) => s.id === item.id) ? prev : [...prev, item]);
  }

  /** Remove a selected item (used by the close button in non-child-tree mode). */
  remove(id: string): void {
    this.selection.update((prev) => prev.filter((m) => m.id !== id));
  }

  createNewEntity(): void {
    const name = this.newEntityName().trim();
    if (!name || this.creating()) return;

    this.creating.set(true);
    const guid = this.generateGuid();
    const body = {
      id: guid,
      displayName: name,
      type: this.targetType,
      status: 'ACTIVE',
    };

    this.entityApi.putEntity(guid, body, this.targetType).subscribe({
      next: (response: unknown) => {
        const resp = response as Record<string, unknown>;
        const createdId = typeof resp?.['id'] === 'string' ? resp['id'] : guid;
        const newItem: ReferenceEditorItem = {
          id: createdId,
          type: this.targetType,
          displayName: name,
          fullName: name,
          description: undefined,
        };
        this.entities.update((prev) => [...prev, newItem]);
        this.newEntityName.set('');
        this.selection.update((prev) => [...prev, newItem]);
      },
      error: (err) => {
        console.error('Failed to create entity:', err);
        this.creating.set(false);
      },
      complete: () => this.creating.set(false),
    });
  }

  private generateGuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ── Child tree helpers ────────────────────────────────────────

  /** Single-parented children of a given BC. */
  getChildren(bcId: string): ReferenceEditorItem[] {
    return this.childMap.get(bcId) ?? [];
  }

  /** All descendants of a BC (recursive, max depth 3, cycle-safe). Includes multi-parented children. */
  getDescendants(bcId: string, depth: number = 0, visited: Set<string> = new Set()): (ReferenceEditorItem & { _depth: number })[] {
    if (depth >= 3 || visited.has(bcId)) return [];
    visited.add(bcId);
    const children = this.childMap.get(bcId) ?? [];
    const result: (ReferenceEditorItem & { _depth: number })[] = [];
    for (const child of children) {
      result.push({ ...child, _depth: depth });
      result.push(...this.getDescendants(child.id, depth + 1, new Set(visited)));
    }
    return result;
  }

  isChildChecked(id: string): boolean {
    return this.checkedChildren().has(id);
  }

  isParentOverridden(id: string): boolean {
    return this.overriddenParents().has(id) || this.userUnchecked().has(id);
  }

  isParentChecked(item: ReferenceEditorItem): boolean {
    return !this.isParentOverridden(item.id);
  }

  toggleChild(child: ReferenceEditorItem, parentId: string): void {
    if (this.checkedChildren().has(child.id)) {
      this.checkedChildren.update((s) => {
        const n = new Set(s);
        n.delete(child.id);
        return n;
      });
      // Re-enable parent only if no other descendant is still checked
      const anySiblingChecked = this.getDescendants(parentId).some((d) => this.checkedChildren().has(d.id));
      if (!anySiblingChecked) {
        this.overriddenParents.update((s) => {
          const n = new Set(s);
          n.delete(parentId);
          return n;
        });
      }
    } else {
      this.checkedChildren.update((s) => new Set(s).add(child.id));
      // Auto-uncheck parent if still checked
      if (!this.overriddenParents().has(parentId) && !this.userUnchecked().has(parentId)) {
        this.overriddenParents.update((s) => new Set(s).add(parentId));
        const parentItem = this.selection().find((s) => s.id === parentId);
        const parentName = parentItem?.displayName ?? parentId;
        this.snackBar.open(`Automatically un-selected '${parentName}'`, undefined, { duration: 3000 });
      }
    }
  }

  toggleParentCheck(item: ReferenceEditorItem): void {
    if (this.userUnchecked().has(item.id)) {
      // Re-check
      this.userUnchecked.update((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
    } else {
      // Un-check
      this.userUnchecked.update((s) => new Set(s).add(item.id));
    }
  }

  // ── Coverage / Comments editing ────────────────────────────────
  /** Sentinel value in the slider representing "N/A" (undefined coverage). */
  static readonly COVERAGE_NA = -10;

  /** Convert stored coverage (undefined | 0..100) to slider value (-10 | 0..100). */
  coverageToSlider(value: number | undefined): number {
    return value != null ? value : ReferenceEditorDialogComponent.COVERAGE_NA;
  }

  /** Convert slider value (-10 | 0..100) to stored coverage (undefined | 0..100). */
  sliderToCoverage(value: number): number | undefined {
    return value === ReferenceEditorDialogComponent.COVERAGE_NA ? undefined : value;
  }

  updateCoverage(id: string, sliderValue: number): void {
    const coverage = this.sliderToCoverage(sliderValue);
    this.selection.update((items) =>
      items.map((it) => it.id === id ? { ...it, coverage } : it),
    );
  }

  updateComments(id: string, value: string): void {
    this.selection.update((items) =>
      items.map((it) => it.id === id ? { ...it, comments: value } : it),
    );
  }

  /** Auto-resize a textarea to fit its content. */
  autoResizeComments(event: Event): void {
    const ta = event.target as HTMLTextAreaElement;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }

  // ── Dialog actions ─────────────────────────────────────────────

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  ok(): void {
    const userUnchecked = this.userUnchecked();
    const overridden = this.overriddenParents();
    const children = this.checkedChildren();

    // Filter out user-unchecked and auto-overridden parents
    const kept = this.selection().filter((s) => !userUnchecked.has(s.id) && !overridden.has(s.id));

    // Add checked children from the subtree
    const childItems: ReferenceEditorItem[] = [];
    for (const bc of this.allBcs) {
      if (children.has(bc.id)) {
        childItems.push({
          id: bc.id,
          type: 'BusinessCapability',
          displayName: bc.displayName,
          fullName: bc.displayName,
          description: undefined,
        });
      }
    }

    this.dialogRef.close([...kept, ...childItems]);
  }
}
