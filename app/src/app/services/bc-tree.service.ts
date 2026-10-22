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

import { Injectable, inject, signal, computed } from '@angular/core';
import { EntityApiService } from './entity-api.service';
import { extractParentIds } from '../utils/parent-utils';
import { matchesSearch } from '../utils/search-utils';
import { compareBySortOrder, sortBySortOrder } from '../utils/sort-order';

// ── Public types ──────────────────────────────────────────────

/** Raw flat item from the API. */
export interface BcItem {
  id: string;
  displayName: string;
  relToParent?: any;
  status?: string;
  sortOrder?: number | null;
  [key: string]: any;
}

/** Full tree node with multi-parent cloning support. */
export interface BcTreeNode {
  id: string;
  displayName: string;
  status: string;
  parentIds: string[];
  children: BcTreeNode[];
  /** The parent this particular instance is attached to (undefined for roots). */
  _attachedToParentId?: string;
  /** Original raw item reference. */
  _original?: BcItem;
}

/** Flattened tree option for display in filter dropdowns and selection trees. */
export interface BcTreeOption {
  id: string;
  label: string;
  depth: number;
  trackId: string;
  parentId?: string;
  status: string;
  countLabel?: string;
  fullPath?: string;
}

/** One Business Capability column of the Excel matrix export. */
export interface BcMatrixColumn {
  id: string;
  /** Header label: the capability's own display name — same string the dropdown shows. */
  displayName: string;
  /** Level in the active tree — used as Excel outline level for column grouping. */
  depth: number;
  /** Id of the parent capability's column (undefined for root-level columns). */
  parentId?: string;
}

// ── Service ───────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class BcTreeService {
  private entityApi = inject(EntityApiService);

  // ── Raw data (fetched once, cached in memory) ─────────────

  private readonly _rawItems = signal<BcItem[]>([]);
  private readonly _loaded = signal(false);
  private readonly _loading = signal(false);
  private loadWaiters: Array<() => void> = [];

  /** Raw flat BC list from the API. */
  readonly rawItems = this._rawItems.asReadonly();
  readonly loaded = this._loaded.asReadonly();

  // ── Derived maps (computed from rawItems) ──────────────────

  /** parentId → child IDs (all children, including multi-parented). */
  readonly childrenOf = computed(() => {
    const items = this._rawItems();
    const map = new Map<string, string[]>();
    for (const item of items) {
      for (const pid of extractParentIds(item.relToParent)) {
        let list = map.get(pid);
        if (!list) { list = []; map.set(pid, list); }
        list.push(item.id);
      }
    }
    return map;
  });

  /** childId → parent IDs. */
  readonly parentsOf = computed(() => {
    const items = this._rawItems();
    const map = new Map<string, string[]>();
    for (const item of items) {
      map.set(item.id, extractParentIds(item.relToParent));
    }
    return map;
  });

  /** Status map: id → status string. */
  readonly statusMap = computed(() => {
    const items = this._rawItems();
    const map = new Map<string, string>();
    for (const item of items) {
      map.set(item.id, item.status ?? 'ACTIVE');
    }
    return map;
  });

  /**
   * Set of IDs that are NOT actively reachable from any ACTIVE root.
   *
   * Reachability propagates only through ACTIVE nodes:
   * - A root (no parents) is reachable if ACTIVE
   * - A child is reachable if at least one ACTIVE parent is reachable
   * - ARCHIVED nodes are never reachable (even if parent is ACTIVE)
   * - Children of ARCHIVED nodes are not reachable through that parent
   */
  readonly activelyReachableIds = computed(() => {
    const items = this._rawItems();
    const parentsOf = this.parentsOf();
    const childrenOf = this.childrenOf();
    const statusMap = this.statusMap();

    const reachable = new Set<string>();
    const queue: string[] = [];

    // Seed: ACTIVE roots (no parents, ACTIVE status)
    for (const item of items) {
      const pids = parentsOf.get(item.id) ?? [];
      if (pids.length === 0 && statusMap.get(item.id) === 'ACTIVE') {
        reachable.add(item.id);
        queue.push(item.id);
      }
    }

    // BFS: propagate reachability downward — only through ACTIVE nodes
    while (queue.length > 0) {
      const pid = queue.shift()!;
      for (const childId of childrenOf.get(pid) ?? []) {
        if (!reachable.has(childId) && statusMap.get(childId) === 'ACTIVE') {
          reachable.add(childId);
          queue.push(childId);
        }
      }
    }

    // Return the complement: IDs that are NOT reachable
    return new Set(items.filter((b) => !reachable.has(b.id)).map((b) => b.id));
  });

  /**
   * Descendant map: id → set of all descendant IDs (including self).
   * Uses BFS downward through childrenOf.
   */
  readonly descendantMap = computed(() => {
    const childrenOf = this.childrenOf();
    const items = this._rawItems();
    const allIds = new Set(items.map((i) => i.id));
    const map = new Map<string, Set<string>>();

    for (const item of items) {
      if (map.has(item.id)) continue;
      const visited = new Set<string>();
      const stack = [item.id];
      while (stack.length > 0) {
        const nid = stack.pop()!;
        if (visited.has(nid)) continue;
        visited.add(nid);
        for (const cid of childrenOf.get(nid) ?? []) {
          if (allIds.has(cid)) stack.push(cid);
        }
      }
      map.set(item.id, visited);
    }
    return map;
  });

  // ── Loading ───────────────────────────────────────────────

  /** Load BCs from API — idempotent, only fetches once. */
  load(): void {
    if (this._loaded() || this._loading()) return;
    this._loading.set(true);
    this.entityApi.listBusinessCapabilities().subscribe({
      next: (body: any) => {
        const raw = Array.isArray(body) ? body : (body?.businessCapabilities ?? []);
        const items: BcItem[] = Array.isArray(raw) ? raw : [];
        this._rawItems.set(items);
        this._loaded.set(true);
        this._loading.set(false);
        this.resolveLoadWaiters();
      },
      error: () => {
        this._rawItems.set([]);
        this._loaded.set(true);
        this._loading.set(false);
        this.resolveLoadWaiters();
      },
    });
  }

  /** Resolve once the raw BC list has been loaded (immediately when it already is). */
  awaitLoaded(): Promise<void> {
    if (this._loaded()) return Promise.resolve();
    return new Promise<void>((resolve) => this.loadWaiters.push(resolve));
  }

  private resolveLoadWaiters(): void {
    const waiters = this.loadWaiters;
    this.loadWaiters = [];
    for (const resolve of waiters) resolve();
  }

  // ── Tree building ─────────────────────────────────────────

  /**
   * Build the FULL tree with multi-parent cloning and cycle breaking.
   *
   * - Items with no parents → root
   * - Items whose parents are all missing from the dataset → root
   * - Items with valid parents → placed under first valid parent
   * - Additional parents → deep-cloned subtree attached
   * - Cycle breaking: visited set prevents infinite loops
   * - Siblings (roots and children) ordered by sortOrder ASC, missing values last, displayName as tie-breaker
   *
   * @param items Optional override (defaults to rawItems).
   * @returns Forest of root BcTreeNodes.
   */
  buildFullTree(items?: BcItem[]): BcTreeNode[] {
    const source = items ?? this._rawItems();
    const itemMap = new Map<string, BcItem>();
    for (const item of source) {
      itemMap.set(item.id, item);
    }

    const createNode = (item: BcItem): BcTreeNode => ({
      id: item.id,
      displayName: item.displayName || item.id,
      status: item.status ?? 'ACTIVE',
      parentIds: extractParentIds(item.relToParent),
      children: [],
      _original: item,
    });

    const primaryNodes = new Map<string, BcTreeNode>();
    for (const item of source) {
      primaryNodes.set(item.id, createNode(item));
    }

    const roots: BcTreeNode[] = [];
    const placed = new Set<string>();

    // Pass 1: place each item under its first valid parent (or root)
    for (const item of source) {
      const primary = primaryNodes.get(item.id)!;
      const validParents = primary.parentIds.filter((pid) => itemMap.has(pid));

      if (validParents.length > 0) {
        const firstParent = primaryNodes.get(validParents[0])!;
        firstParent.children.push(primary);
        primary._attachedToParentId = validParents[0];
        placed.add(item.id);
      } else {
        // No valid parents → root
        if (!placed.has(item.id)) {
          roots.push(primary);
          placed.add(item.id);
        }
      }
    }

    // Pass 2: clone subtrees for additional parents
    for (const item of source) {
      const primary = primaryNodes.get(item.id)!;
      const validParents = primary.parentIds.filter((pid) => itemMap.has(pid));
      for (let i = 1; i < validParents.length; i++) {
        const parentNode = primaryNodes.get(validParents[i])!;
        const dupe = this.cloneSubtree(primary, validParents[i]);
        parentNode.children.push(dupe);
      }
    }

    // Order siblings on every level by sortOrder ASC, missing values last, displayName as tie-breaker.
    const sortLevel = (nodes: BcTreeNode[]): void => {
      nodes.sort(
        (a, b) =>
          compareBySortOrder(a._original?.sortOrder, b._original?.sortOrder) ||
          a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
      );
      for (const node of nodes) {
        sortLevel(node.children);
      }
    };
    sortLevel(roots);

    return roots;
  }

  /**
   * Deep-clone a subtree, assigning _attachedToParentId.
   * Cycle-safe via the original node identity (no infinite recursion since
   * the source tree is acyclic by construction in buildFullTree).
   */
  private cloneSubtree(node: BcTreeNode, attachedToParentId: string): BcTreeNode {
    return {
      id: node.id,
      displayName: node.displayName,
      status: node.status,
      parentIds: node.parentIds,
      children: node.children.map((child) => this.cloneSubtree(child, attachedToParentId)),
      _attachedToParentId: attachedToParentId,
      _original: node._original,
    };
  }

  // ── Excel matrix export ────────────────────────────────────

  /**
   * Business capabilities to export as Excel matrix columns: every referenced
   * capability plus its path up to a root capability.
   *
   * Built on the very structures the filter dropdown uses — buildFullTree()
   * (multi-parent cloning, sortOrder ordering) followed by filterActiveOnly()
   * (the shared hide logic: capabilities that are only parented, directly or
   * indirectly, by ARCHIVED ones are dropped) — so the export can never show a
   * chain that is invisible in the UI.
   *
   * Columns are in depth-first order of the active tree, so a parent column is
   * always immediately followed by the columns of its subtree — Excel can then
   * group the children columns under their parent (summary column on the left).
   * A capability that is referenced but hidden is not exported at all.
   *
   * Logs the resulting header list (plus every hidden referenced capability and
   * the old faulty chain it used to be exported under) to the console.
   */
  getMatrixBusinessCapabilities(referencedIds: Set<string>, options?: { subtreeOf?: string }): BcMatrixColumn[] {
    if (referencedIds.size === 0) return [];

    const activeTree = this.filterActiveOnly(this.buildFullTree());

    // First-placement walk of the active tree: order, depth, parent, active chain.
    const entries: { node: BcTreeNode; depth: number; parent?: BcTreeNode; path: string[] }[] = [];
    const parentOf = new Map<string, BcTreeNode>();
    const seen = new Set<string>();
    const walk = (nodes: BcTreeNode[], depth: number, parent: BcTreeNode | undefined, parentPath: string[]): void => {
      for (const node of nodes) {
        if (seen.has(node.id)) continue;
        seen.add(node.id);
        if (parent) parentOf.set(node.id, parent);
        const path = [...parentPath, node.displayName];
        entries.push({ node, depth, parent, path });
        walk(node.children, depth + 1, node, path);
      }
    };
    walk(activeTree, 0, undefined, []);

    const entryById = new Map(entries.map((e) => [e.node.id, e]));

    // Optional subtree restriction ("Excel: Apply filter to Business Capabilities"
    // plus a list filter on Business Capabilities): only capabilities placed below
    // the filtered one are exposed, and the walk upwards stops there — the filtered
    // capability becomes the top column (depth 0).
    const subtreeOf = options?.subtreeOf;
    const baseDepth = subtreeOf && entryById.has(subtreeOf) ? entryById.get(subtreeOf)!.depth : 0;
    const belowSubtree = (id: string): boolean => {
      if (!subtreeOf) return true;
      let current: string | undefined = id;
      const guard = new Set<string>();
      while (current && !guard.has(current)) {
        if (current === subtreeOf) return true;
        guard.add(current);
        current = parentOf.get(current)?.id;
      }
      return false;
    };

    // Needed = referenced capabilities + their ancestors within the active tree.
    const needed = new Set<string>();
    for (const id of referencedIds) {
      if (!entryById.has(id) || !belowSubtree(id)) continue;
      let current: string | undefined = id;
      const guard = new Set<string>();
      while (current && entryById.has(current) && !guard.has(current)) {
        guard.add(current);
        needed.add(current);
        if (current === subtreeOf) break;
        current = parentOf.get(current)?.id;
      }
    }

    const columns: BcMatrixColumn[] = [];
    const emitted = new Set<string>();
    for (const entry of entries) {
      const id = entry.node.id;
      if (!needed.has(id) || emitted.has(id)) continue;
      emitted.add(id);
      columns.push({ id, displayName: entry.node.displayName, depth: entry.depth - baseDepth, parentId: entry.parent?.id });
    }

    this.logMatrixHeader(referencedIds, columns, entryById, subtreeOf);
    return columns;
  }

  /** Debug output for the Excel matrix export: header list + hidden referenced capabilities. */
  private logMatrixHeader(
    referencedIds: Set<string>,
    columns: BcMatrixColumn[],
    entryById: Map<string, { node: BcTreeNode; depth: number; parent?: BcTreeNode; path: string[] }>,
    subtreeOf?: string
  ): void {
    const header = columns.map((col, i) => {
      const entry = entryById.get(col.id);
      const activePath = entry?.path ?? [];
      // The chain the export used before it followed the shared service (archived parents included).
      const oldPath = this.buildPrimaryParentChain(col.id);
      const row: Record<string, unknown> = {
        col: i + 1,
        id: col.id,
        label: col.displayName,
        depth: col.depth,
        parent: entry?.parent ? `${entry.parent.displayName} (${entry.parent.id})` : null,
        activePath: activePath.join(' > '),
        directlyReferenced: referencedIds.has(col.id),
      };
      if (oldPath.join(' > ') !== activePath.join(' > ')) row['oldPath'] = oldPath.join(' > ');
      return row;
    });

    const hiddenReferenced: Record<string, unknown>[] = [];
    for (const id of referencedIds) {
      if (entryById.has(id)) continue;
      hiddenReferenced.push({
        id,
        name: this.getDisplayName(id),
        status: this.statusMap().get(id) ?? 'UNKNOWN',
        oldPath: this.buildPrimaryParentChain(id).join(' > '),
      });
    }

    const rectified = header.filter((r) => r['oldPath'] != null).length;
    console.log(
      `[BC matrix] ${referencedIds.size} referenced capabilities → ${columns.length} header columns ` +
        `(${rectified} with a rectified chain, ${hiddenReferenced.length} hidden and dropped)` +
        (subtreeOf ? `, restricted to the subtree of ${this.getDisplayName(subtreeOf)} (${subtreeOf})` : ''),
      { header, hiddenReferenced, subtreeOf: subtreeOf ?? null }
    );
  }

  /** Chain of display names from `id` up to a root via the first parent present in the dataset
   *  — the primary-parent walk the export used before it followed the shared service. */
  private buildPrimaryParentChain(id: string): string[] {
    const byId = new Map<string, BcItem>();
    for (const item of this._rawItems()) byId.set(item.id, item);
    const chain: string[] = [];
    const seen = new Set<string>();
    let current: string | undefined = id;
    while (current && byId.has(current) && !seen.has(current)) {
      seen.add(current);
      const item: BcItem = byId.get(current)!;
      chain.push(item.displayName || item.id);
      current = extractParentIds(item.relToParent).filter((pid) => byId.has(pid))[0];
    }
    return chain;
  }

  // ── Filtering ─────────────────────────────────────────────

  /**
   * Filter tree: keep only actively reachable nodes.
   * Uses the pre-computed activelyReachableIds — no re-computation.
   */
  filterActiveOnly(nodes: BcTreeNode[]): BcTreeNode[] {
    const notReachable = this.activelyReachableIds();
    return this.filterTree(nodes, (node) => !notReachable.has(node.id));
  }

  /**
   * Filter tree by text: keep matching nodes + all ancestors recursively.
   * Matching nodes keep ALL their descendants.
   */
  filterByText(nodes: BcTreeNode[], text: string): BcTreeNode[] {
    const trimmed = text.trim();
    if (!trimmed) return nodes;

    const items = this._rawItems();
    const parentsOf = this.parentsOf();
    const childrenOf = this.childrenOf();

    // Find matching IDs
    const matchedIds = new Set<string>();
    for (const item of items) {
      const name = item.displayName ?? '';
      if (matchesSearch(trimmed, name)) {
        matchedIds.add(item.id);
      }
    }
    if (matchedIds.size === 0) return nodes;

    // Include all ancestors of matches
    const includeIds = new Set<string>(matchedIds);
    for (const id of matchedIds) {
      let queue = [...(parentsOf.get(id) ?? [])];
      while (queue.length > 0) {
        const pid = queue.shift()!;
        if (includeIds.has(pid)) continue;
        includeIds.add(pid);
        queue.push(...(parentsOf.get(pid) ?? []));
      }
    }

    // Include all descendants of matches
    for (const id of matchedIds) {
      let queue = [...(childrenOf.get(id) ?? [])];
      while (queue.length > 0) {
        const cid = queue.shift()!;
        if (includeIds.has(cid)) continue;
        includeIds.add(cid);
        queue.push(...(childrenOf.get(cid) ?? []));
      }
    }

    return this.filterTree(nodes, (node) => includeIds.has(node.id));
  }

  /** Generic tree filter: keeps a node if predicate returns true, prunes children otherwise. */
  private filterTree(nodes: BcTreeNode[], predicate: (node: BcTreeNode) => boolean): BcTreeNode[] {
    const result: BcTreeNode[] = [];
    for (const node of nodes) {
      if (!predicate(node)) continue;
      const filteredChildren = this.filterTree(node.children, predicate);
      result.push({
        ...node,
        children: filteredChildren,
      });
    }
    return result;
  }

  // ── Flatten for display ───────────────────────────────────

  /**
   * Flatten a BcTreeNode forest into a depth-first BcTreeOption list.
   * Used for filter dropdowns and selection trees.
   *
   * @param nodes Root nodes (already filtered).
   * @param counts Optional app-count map for count labels.
   * @param searchActive Whether text search is active (affects count=0 hiding).
   * @param selectedId Currently selected BC id (for "isSelected" mode).
   */
  flattenForDisplay(
    nodes: BcTreeNode[],
    counts?: Map<string, number>,
    searchActive?: boolean,
    selectedId?: string
  ): BcTreeOption[] {
    const out: BcTreeOption[] = [];
    this.flattenWalk(nodes, 0, out, counts, new Set<string>(), searchActive, selectedId, '');
    return out;
  }

  private flattenWalk(
    nodes: BcTreeNode[],
    depth: number,
    out: BcTreeOption[],
    counts: Map<string, number> | undefined,
    visited: Set<string>,
    searchActive: boolean | undefined,
    selectedId: string | undefined,
    parentTrackId: string
  ): void {
    for (const node of nodes) {
      const dupeKey = node._attachedToParentId ? `${node.id}__${node._attachedToParentId}` : node.id;
      const trackId = visited.has(node.id) ? dupeKey : node.id;
      visited.add(node.id);

      const count = counts?.get(node.id);
      const countLabel = count != null ? ` (${count})` : undefined;

      // In non-search mode: skip count=0 leaf nodes unless they're the selected item
      if (count === 0 && !searchActive && !selectedId) {
        continue;
      }

      out.push({
        id: node.id,
        label: node.displayName,
        depth,
        trackId,
        parentId: parentTrackId || undefined,
        status: node.status,
        countLabel,
        fullPath: this.buildPath(node),
      });

      if (node.children.length > 0) {
        this.flattenWalk(node.children, depth + 1, out, counts, visited, searchActive, selectedId, trackId);
      }
    }
  }

  /** Build a "Parent / Child / Leaf" display path for a node. */
  private buildPath(node: BcTreeNode): string {
    // Use the _original displayName which has the full path from the API
    return node._original?.displayName ?? node.displayName;
  }

  // ── Helpers for components ────────────────────────────────

  /** Map parentId → children whose relToParent includes that parent (multi-parented children appear under each parent). Children are ordered by sortOrder ASC, missing values last, displayName as tie-breaker. */
  getChildrenByParent(): Map<string, BcItem[]> {
    const items = this._rawItems();
    const map = new Map<string, BcItem[]>();
    for (const item of items) {
      for (const pid of extractParentIds(item.relToParent)) {
        let list = map.get(pid);
        if (!list) { list = []; map.set(pid, list); }
        list.push(item);
      }
    }
    const sorted = new Map<string, BcItem[]>();
    for (const [parentId, list] of map) {
      sorted.set(parentId, sortBySortOrder(
        list,
        (item) => item.sortOrder,
        (a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
      ));
    }
    return sorted;
  }

  /** Get a BC item by ID. */
  getItem(id: string): BcItem | undefined {
    return this._rawItems().find((i) => i.id === id);
  }

  /** Get display name for a BC ID. */
  getDisplayName(id: string): string {
    return this._rawItems().find((i) => i.id === id)?.displayName ?? id;
  }
}
