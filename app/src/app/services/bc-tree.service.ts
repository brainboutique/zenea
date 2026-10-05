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

// ── Service ───────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class BcTreeService {
  private entityApi = inject(EntityApiService);

  // ── Raw data (fetched once, cached in memory) ─────────────

  private readonly _rawItems = signal<BcItem[]>([]);
  private readonly _loaded = signal(false);
  private readonly _loading = signal(false);

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
      },
      error: () => {
        this._rawItems.set([]);
        this._loaded.set(true);
        this._loading.set(false);
      },
    });
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
   * - Siblings (roots and children) ordered by sortOrder ASC, missing values last
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

    // Order siblings on every level by sortOrder ASC, missing values last.
    const sortLevel = (nodes: BcTreeNode[]): void => {
      nodes.sort((a, b) => compareBySortOrder(a._original?.sortOrder, b._original?.sortOrder));
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

  /** Get single-parented children map (for dialog childMap). Children are ordered by sortOrder ASC, missing values last. */
  getSingleParentChildren(): Map<string, BcItem[]> {
    const items = this._rawItems();
    const map = new Map<string, BcItem[]>();
    for (const item of items) {
      const pids = extractParentIds(item.relToParent);
      if (pids.length === 1) {
        let list = map.get(pids[0]);
        if (!list) { list = []; map.set(pids[0], list); }
        list.push(item);
      }
    }
    const sorted = new Map<string, BcItem[]>();
    for (const [parentId, list] of map) {
      sorted.set(parentId, sortBySortOrder(list, (item) => item.sortOrder));
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
