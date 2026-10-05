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

import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  ChangeDetectorRef,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslatePipe } from '@ngx-translate/core';
import { EntityApiService } from '../../services/entity-api.service';
import { UserConfigService } from '../../services/user-config.service';
import { ApplicationsService, ApplicationItem } from '../../services/ApplicationsService';
import { BcTreeService, BcTreeNode } from '../../services/bc-tree.service';
import { extractParentIds } from '../../utils/parent-utils';
import { compareBySortOrder } from '../../utils/sort-order';
import { matchesSearch } from '../../utils/search-utils';
import { readRelationItems } from '../../utils/relation-data';

export interface TreeNode {
  id: string;
  displayName: string;
  description?: string;
  countryIsoCode?: string;
  category?: string;
  status?: string;
  depth: number;
  children: TreeNode[];
  _parentRefs: TreeNode[];
  _original: any;
  _directCount?: number;
  _indirectCount?: number;
  _additionalParentCount?: number;
  _additionalParentNames?: string;
}

@Component({
  selector: 'app-hierarchical-tree',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule, MatSnackBarModule, TranslatePipe],
  templateUrl: './hierarchical-tree.component.html',
  styleUrl: './hierarchical-tree.component.scss',
})
export class HierarchicalTreeComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private entityApi = inject(EntityApiService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);
  private userConfig = inject(UserConfigService);
  private snackBar = inject(MatSnackBar);
  private applicationsService = inject(ApplicationsService);
  private bcTree = inject(BcTreeService);

  readonly loading = signal(true);
  readonly pageTitle = signal('');
  readonly treeNodes = signal<TreeNode[]>([]);
  readonly expandedIds = signal(new Set<string>());
  readonly entityType = signal('');
  readonly draggedNodeId = signal<string | null>(null);
  readonly draggedFromParentId = signal<string | null>(null);
  readonly draggedNodeRef = signal<TreeNode | null>(null);
  readonly dropTargetId = signal<string | null>(null);
  readonly filterText = signal('');

  readonly filteredTreeNodes = computed(() => {
    const text = this.filterText().trim();
    const nodes = this.treeNodes();
    if (!text) return nodes;
    return this.filterTreeNodes(nodes, text);
  });

  private flatItems: any[] = [];
  private pendingRoots: TreeNode[] = [];
  private pendingRelationKey: 'relApplicationToBusinessCapability' | 'relApplicationToUserGroup' | null = null;

  constructor() {
    effect(() => {
      // When BC tree data becomes available, build if pending
      const loaded = this.bcTree.loaded();
      const type = this.entityType();
      if (loaded && type === 'BusinessCapabilities' && this.loading()) {
        this.buildBcTree();
      }
      // When apps become available, recompute counts if pending
      const apps = this.applicationsService.applications();
      if (apps.length > 0 && this.pendingRoots.length > 0 && this.pendingRelationKey) {
        this.computeAppCounts(this.pendingRoots, this.pendingRelationKey);
        this.pendingRoots = [];
        this.pendingRelationKey = null;
        this.treeNodes.set([...this.treeNodes()]);
        this.cdr.detectChanges();
      }
    });
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const type = params.get('type') || '';
      this.entityType.set(type);
      this.pageTitle.set(this.getPageTitle(type));
      this.loadTreeData(type);
    });
  }

  private getPageTitle(type: string): string {
    switch (type) {
      case 'BusinessCapabilities': return 'Business Capabilities';
      case 'UserGroups': return 'User Groups';
      default: return type;
    }
  }

  private loadTreeData(type: string): void {
    this.loading.set(true);
    this.treeNodes.set([]);
    this.expandedIds.set(new Set());
    this.flatItems = [];

    if (type === 'BusinessCapabilities') {
      this.bcTree.load();
      if (this.bcTree.loaded()) {
        this.buildBcTree();
      }
      // If not yet loaded, the effect in constructor will trigger buildBcTree
    } else if (type === 'UserGroups') {
      this.entityApi.listUserGroups().subscribe({
        next: (body: any) => {
          const raw = Array.isArray(body) ? body : (body?.userGroups ?? []);
          const items = Array.isArray(raw) ? raw : [];
          this.flatItems = items;
          const roots = this.buildTreeFromParentField(items);
          this.computeAppCounts(roots, 'relApplicationToUserGroup');
          this.computeAdditionalParents(roots);
          this.treeNodes.set(roots);
          this.loading.set(false);
          this.cdr.detectChanges();
        },
        error: () => { this.loading.set(false); },
      });
    } else {
      this.loading.set(false);
    }
  }

  /** Build the admin BC tree using BcTreeService (shows ALL including ARCHIVED). */
  private buildBcTree(): void {
    const bcTreeNodes = this.bcTree.buildFullTree();
    this.flatItems = this.bcTree.rawItems();
    const roots = this.convertBcTreeNodes(bcTreeNodes, 0);
    // Second pass: set up _parentRefs for additional-parent tracking
    const nodeById = new Map<string, TreeNode>();
    const collectNodes = (nodes: TreeNode[]): void => {
      for (const n of nodes) {
        nodeById.set(n.id, n);
        collectNodes(n.children);
      }
    };
    collectNodes(roots);
    const setupParentRefs = (nodes: BcTreeNode[], treeNodes: TreeNode[]): void => {
      for (let i = 0; i < nodes.length; i++) {
        const bcNode = nodes[i];
        const treeNode = treeNodes[i];
        if (bcNode._attachedToParentId) {
          const parent = nodeById.get(bcNode._attachedToParentId);
          if (parent) treeNode._parentRefs = [parent];
        }
        setupParentRefs(bcNode.children, treeNode.children);
      }
    };
    setupParentRefs(bcTreeNodes, roots);

    // Siblings ordered by sortOrder ASC (missing values last), displayName as tie-breaker.
    this.sortTree(roots);

    this.computeAppCounts(roots, 'relApplicationToBusinessCapability');
    this.computeAdditionalParents(roots);
    this.treeNodes.set(roots);
    this.loading.set(false);
    this.cdr.detectChanges();
  }

  /** Convert BcTreeNode[] to the component's TreeNode[] format. */
  private convertBcTreeNodes(nodes: BcTreeNode[], depth: number): TreeNode[] {
    return nodes.map((n) => {
      const treeNode: TreeNode = {
        id: n.id,
        displayName: n.displayName,
        description: n._original?.['description'],
        countryIsoCode: n._original?.['countryIsoCode'],
        category: n._original?.['category'],
        status: n.status,
        depth,
        children: this.convertBcTreeNodes(n.children, depth + 1),
        _parentRefs: [],
        _original: n._original,
      };
      return treeNode;
    });
  }

  private buildTreeFromDisplayNames(items: { id: string; displayName: string; description?: string }[]): TreeNode[] {
    const segmentsById = new Map<string, string[]>();
    const segmentParents = new Map<string, string>();

    for (const item of items) {
      const segments = item.displayName.split('/').map((s) => s.trim()).filter(Boolean);
      segmentsById.set(item.id, segments);

      let parentPath = '';
      for (const seg of segments) {
        const fullPath = parentPath ? `${parentPath} / ${seg}` : seg;
        if (parentPath) {
          segmentParents.set(fullPath, parentPath);
        }
        parentPath = fullPath;
      }
    }

    const pathToItem = new Map<string, any>();
    for (const item of items) {
      const segments = segmentsById.get(item.id) || [];
      pathToItem.set(segments.join(' / '), item);
    }

    const nodeMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    const ensureNode = (fullPath: string, depth: number): TreeNode => {
      if (nodeMap.has(fullPath)) return nodeMap.get(fullPath)!;
      const segments = fullPath.split(' / ');
      const item = pathToItem.get(fullPath);
      const node: TreeNode = {
        id: item?.id || fullPath,
        displayName: segments[segments.length - 1],
        description: item?.description,
        depth,
        children: [],
        _parentRefs: [],
        _original: item || null,
      };
      nodeMap.set(fullPath, node);
      return node;
    };

    for (const item of items) {
      const segments = segmentsById.get(item.id) || [];
      const fullDisplay = segments.join(' / ');
      const childNode = ensureNode(fullDisplay, segments.length - 1);

      const parentPath = segmentParents.get(fullDisplay);
      if (parentPath) {
        const parentNode = ensureNode(parentPath, segments.length - 2);
        childNode._parentRefs = [parentNode];
        parentNode.children.push(childNode);
      } else {
        roots.push(childNode);
      }
    }

    this.sortTree(roots);
    return roots;
  }

  private buildTreeFromRelToParent(items: { id: string; displayName: string; relToParent?: any; description?: string; status?: string }[]): TreeNode[] {
    const itemMap = new Map<string, any>();
    for (const item of items) {
      itemMap.set(item.id, item);
    }

    const getShortName = (displayName: string, parentDisplayName?: string): string => {
      const segments = displayName.split('/').map((s: string) => s.trim()).filter(Boolean);
      if (segments.length > 1 && parentDisplayName?.startsWith(segments[0])) {
        return segments[segments.length - 1];
      }
      return displayName;
    };

    const createNode = (id: string, parentDisplayName?: string): TreeNode => {
      const item = itemMap.get(id);
      const displayName = item?.displayName || id;
      return {
        id,
        displayName: getShortName(displayName, parentDisplayName),
        description: item?.description,
        status: item?.status,
        depth: 0,
        children: [],
        _parentRefs: [],
        _original: item || null,
      };
    };

    const primaryNodes = new Map<string, TreeNode>();
    for (const item of items) {
      primaryNodes.set(item.id, createNode(item.id));
    }

    const roots: TreeNode[] = [];
    const placed = new Set<string>();
    const rootIds = new Set<string>();

    for (const item of items) {
      const parents = extractParentIds(item.relToParent);
      const primary = primaryNodes.get(item.id)!;

      if (parents.length === 0) {
        if (!placed.has(item.id)) {
          roots.push(primary);
          rootIds.add(item.id);
          placed.add(item.id);
        }
        continue;
      }

      const validParents = parents.filter((p) => itemMap.has(p));

      if (validParents.length > 0) {
        const firstParent = primaryNodes.get(validParents[0])!;
        firstParent.children.push(primary);
        primary._parentRefs.push(firstParent);
        primary.displayName = getShortName(item?.displayName || item.id, firstParent.displayName);
        placed.add(item.id);
        if (rootIds.has(item.id)) {
          rootIds.delete(item.id);
          const idx = roots.indexOf(primary);
          if (idx >= 0) roots.splice(idx, 1);
        }
      } else {
        if (!placed.has(item.id)) {
          roots.push(primary);
          rootIds.add(item.id);
          placed.add(item.id);
        }
      }
    }

    for (const item of items) {
      const parents = extractParentIds(item.relToParent);
      const validParents = parents.filter((p) => itemMap.has(p));
      const primary = primaryNodes.get(item.id)!;
      for (let i = 1; i < validParents.length; i++) {
        const parentNode = primaryNodes.get(validParents[i])!;
        const dupe = this.cloneSubtree(primary, parentNode);
        parentNode.children.push(dupe);
      }
    }

    this.computeDepths(roots, 0);
    this.sortTree(roots);
    return roots;
  }

  private buildTreeFromParentField(items: { id: string; displayName: string; relToParent?: any; description?: string; countryIsoCode?: string; category?: string }[]): TreeNode[] {
    const itemMap = new Map<string, any>();
    for (const item of items) {
      itemMap.set(item.id, item);
    }

    const createNode = (id: string): TreeNode => {
      const item = itemMap.get(id);
      return {
        id,
        displayName: item?.displayName || id,
        description: item?.description,
        countryIsoCode: item?.countryIsoCode,
        category: item?.category,
        depth: 0,
        children: [],
        _parentRefs: [],
        _original: item || null,
      };
    };

    const primaryNodes = new Map<string, TreeNode>();
    for (const item of items) {
      primaryNodes.set(item.id, createNode(item.id));
    }

    const roots: TreeNode[] = [];
    const placed = new Set<string>();
    const rootIds = new Set<string>();

    for (const item of items) {
      const parents = extractParentIds(item.relToParent);
      const primary = primaryNodes.get(item.id)!;

      if (parents.length === 0) {
        if (!placed.has(item.id)) {
          roots.push(primary);
          rootIds.add(item.id);
          placed.add(item.id);
        }
        continue;
      }

      const validParents = parents.filter((p) => itemMap.has(p));

      if (validParents.length > 0) {
        const firstParent = primaryNodes.get(validParents[0])!;
        firstParent.children.push(primary);
        primary._parentRefs.push(firstParent);
        placed.add(item.id);
        if (rootIds.has(item.id)) {
          rootIds.delete(item.id);
          const idx = roots.indexOf(primary);
          if (idx >= 0) roots.splice(idx, 1);
        }
      } else {
        if (!placed.has(item.id)) {
          roots.push(primary);
          rootIds.add(item.id);
          placed.add(item.id);
        }
      }
    }

    for (const item of items) {
      const parents = extractParentIds(item.relToParent);
      const validParents = parents.filter((p) => itemMap.has(p));
      const primary = primaryNodes.get(item.id)!;
      for (let i = 1; i < validParents.length; i++) {
        const dupe = this.cloneSubtree(primary, primaryNodes.get(validParents[i])!);
        const parentNode = primaryNodes.get(validParents[i])!;
        parentNode.children.push(dupe);
      }
    }

    this.computeDepths(roots, 0);
    this.sortTree(roots);
    return roots;
  }

  private computeDepths(nodes: TreeNode[], depth: number): void {
    for (const n of nodes) {
      n.depth = depth;
      this.computeDepths(n.children, depth + 1);
    }
  }

  private sortTree(nodes: TreeNode[]): void {
    nodes.sort((a, b) => {
      const bySortOrder = compareBySortOrder(a._original?.['sortOrder'], b._original?.['sortOrder']);
      return bySortOrder !== 0 ? bySortOrder : a.displayName.localeCompare(b.displayName);
    });
    for (const n of nodes) this.sortTree(n.children);
  }

  private filterTreeNodes(nodes: TreeNode[], text: string): TreeNode[] {
    const result: TreeNode[] = [];
    for (const node of nodes) {
      const selfMatch = matchesSearch(text, node.displayName);
      const filteredChildren = this.filterTreeNodes(node.children, text);
      if (selfMatch || filteredChildren.length > 0) {
        result.push({
          ...node,
          children: filteredChildren,
        });
      }
    }
    return result;
  }

  private cloneSubtree(node: TreeNode, newParent: TreeNode): TreeNode {
    const clone: TreeNode = {
      id: node.id,
      displayName: node.displayName,
      description: node.description,
      countryIsoCode: node.countryIsoCode,
      category: node.category,
      depth: 0,
      children: [],
      _parentRefs: [newParent],
      _original: node._original,
      _directCount: node._directCount,
      _indirectCount: node._indirectCount,
    };
    for (const child of node.children) {
      const childClone = this.cloneSubtree(child, clone);
      clone.children.push(childClone);
    }
    return clone;
  }

  private expandFirstLevels(levels: number): void {
    const expanded = new Set<string>();
    const walk = (nodes: TreeNode[], depth: number): void => {
      if (depth >= levels) return;
      for (const node of nodes) {
        if (node.children.length > 0) {
          expanded.add(node.id);
        }
        walk(node.children, depth + 1);
      }
    };
    walk(this.treeNodes(), 0);
    this.expandedIds.set(expanded);
  }

  private computeAppCounts(roots: TreeNode[], relationKey: 'relApplicationToBusinessCapability' | 'relApplicationToUserGroup'): void {
    const apps = this.applicationsService.applications();
    if (apps.length === 0) {
      this.applicationsService.ensureLoaded();
      this.pendingRoots = roots;
      this.pendingRelationKey = relationKey;
      return;
    }

    const directCounts = new Map<string, Set<string>>();
    for (const app of apps) {
      const items = readRelationItems((app as any)[relationKey]);
      for (const ref of items) {
        if (!ref?.id) continue;
        if (!directCounts.has(ref.id)) directCounts.set(ref.id, new Set());
        directCounts.get(ref.id)!.add(app.id);
      }
    }

    const childrenOf = new Map<string, Set<string>>();
    for (const item of this.flatItems) {
      const parents: string[] = extractParentIds(item.relToParent);
      for (const pid of parents) {
        if (!childrenOf.has(pid)) childrenOf.set(pid, new Set());
        childrenOf.get(pid)!.add(item.id);
      }
    }

    const collectDescendantIds = (nodeId: string, visited = new Set<string>()): Set<string> => {
      if (visited.has(nodeId)) return new Set();
      visited.add(nodeId);
      const ids = new Set<string>([nodeId]);
      const children = childrenOf.get(nodeId);
      if (children) {
        for (const childId of children) {
          for (const id of collectDescendantIds(childId, visited)) ids.add(id);
        }
      }
      return ids;
    };

    const walk = (nodes: TreeNode[]): void => {
      for (const node of nodes) {
        const directApps = directCounts.get(node.id) ?? new Set();
        node._directCount = directApps.size;

        const descendantIds = collectDescendantIds(node.id);
        const indirectApps = new Set<string>();
        for (const descId of descendantIds) {
          if (descId === node.id) continue;
          const descDirect = directCounts.get(descId) ?? new Set();
          for (const appId of descDirect) {
            if (!directApps.has(appId)) {
              indirectApps.add(appId);
            }
          }
        }
        node._indirectCount = indirectApps.size;

        walk(node.children);
      }
    };

    walk(roots);
  }

  private computeAdditionalParents(roots: TreeNode[]): void {
    const nameById = new Map<string, string>();
    for (const item of this.flatItems) {
      nameById.set(item.id, item.displayName || item.fullName || item.id);
    }

    const walk = (nodes: TreeNode[]): void => {
      for (const node of nodes) {
        const item = this.flatItems.find((i: any) => i.id === node.id);
        const parentIds: string[] = extractParentIds(item?.relToParent);
        const primaryParentId = node._parentRefs.length > 0 ? node._parentRefs[0].id : null;
        const additional = parentIds.filter((pid) => pid !== primaryParentId);
        node._additionalParentCount = additional.length;
        node._additionalParentNames = additional.map((pid) => nameById.get(pid) ?? pid).join('\n');
        walk(node.children);
      }
    };

    walk(roots);
  }

  toggleNode(node: TreeNode, event: MouseEvent): void {
    event.stopPropagation();
    const expanded = new Set(this.expandedIds());
    if (expanded.has(node.id)) {
      expanded.delete(node.id);
    } else {
      expanded.add(node.id);
    }
    this.expandedIds.set(expanded);
  }

  isExpanded(node: TreeNode): boolean {
    return this.expandedIds().has(node.id);
  }

  expandAll(): void {
    const expanded = new Set<string>();
    const walk = (nodes: TreeNode[]): void => {
      for (const node of nodes) {
        if (node.children.length > 0) {
          expanded.add(node.id);
        }
        walk(node.children);
      }
    };
    walk(this.treeNodes());
    this.expandedIds.set(expanded);
  }

  collapseAll(): void {
    this.expandedIds.set(new Set());
  }

  trackById(_index: number, node: TreeNode): string {
    return node._parentRefs.length > 0 ? `${node._parentRefs[0].id}::${node.id}` : node.id;
  }

  onDragStart(node: TreeNode, event: DragEvent): void {
    this.draggedNodeId.set(node.id);
    this.draggedFromParentId.set(node._parentRefs.length > 0 ? node._parentRefs[0].id : null);
    this.draggedNodeRef.set(node);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copyMove';
      event.dataTransfer.setData('text/plain', node.id);
    }
  }

  onDragEnd(): void {
    this.draggedNodeId.set(null);
    this.draggedFromParentId.set(null);
    this.draggedNodeRef.set(null);
    this.dropTargetId.set(null);
  }

  onNodeDragOver(node: TreeNode, event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = (event.ctrlKey || event.metaKey) ? 'copy' : 'move';
    }
    this.dropTargetId.set(node.id);
  }

  onNodeDragLeave(_node: TreeNode, _event: DragEvent): void {
    this.dropTargetId.set(null);
  }

  onUnlinkOverlayDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dropTargetId.set('__unlink__');
  }

  onUnlinkOverlayDragLeave(): void {
    this.dropTargetId.set(null);
  }

  onDrop(targetNodeId: string | null, event: DragEvent): void {
    event.preventDefault();
    const draggedId = this.draggedNodeId();
    const fromParentId = this.draggedFromParentId();
    const draggedNode = this.draggedNodeRef();
    if (!draggedId || !draggedNode) return;

    this.draggedNodeId.set(null);
    this.draggedFromParentId.set(null);
    this.draggedNodeRef.set(null);
    this.dropTargetId.set(null);

    if (draggedId === targetNodeId) return;

    if (targetNodeId === '__unlink__') {
      this.handleUnlink(draggedId, fromParentId);
      return;
    }

    const allNodes = this.flattenTree(this.treeNodes());

    if (targetNodeId && targetNodeId !== '__root__') {
      const targetNode = allNodes.find((n) => n.id === targetNodeId);
      if (!targetNode) return;
      if (this.isDescendant(draggedNode, targetNode.id)) {
        this.snackBar.open('Cannot drop here: would create a circular reference.', '', { duration: 3000, panelClass: ['snackbar-error'] });
        return;
      }
    }

    const isAddMode = event.ctrlKey || event.metaKey;
    const newParentId = (targetNodeId && targetNodeId !== '__root__') ? targetNodeId : null;

    if (isAddMode && newParentId) {
      const item = this.flatItems.find((i: any) => i.id === draggedId);
      const existingParents: string[] = extractParentIds(item?.relToParent);
      if (existingParents.includes(newParentId)) {
        this.rebuildFromCurrentTree();
        return;
      }

      const newParents = [...existingParents, newParentId];
      if (this.wouldCreateCycle(draggedId, newParents)) {
        this.snackBar.open('Cannot add parent: would create a circular reference.', '', { duration: 3000, panelClass: ['snackbar-error'] });
        return;
      }

      const targetNode = allNodes.find((n) => n.id === newParentId);
      if (targetNode) {
        const dupe: TreeNode = {
          id: draggedNode.id,
          displayName: draggedNode.displayName,
          description: draggedNode.description,
          countryIsoCode: draggedNode.countryIsoCode,
          category: draggedNode.category,
          depth: 0,
          children: [],
          _parentRefs: [targetNode],
          _original: draggedNode._original,
        };
        targetNode.children.push(dupe);
      }
      this.rebuildFromCurrentTree();
      this.updateFlatItemParents(draggedId, newParents);
      this.persistParentChange(draggedId, newParents);
      this.snackBar.open('Parent added.', '', { duration: 2000 });
    } else {
      const item = this.flatItems.find((i: any) => i.id === draggedId);
      const existingParents: string[] = extractParentIds(item?.relToParent);
      let newParents: string[];
      if (newParentId) {
        if (existingParents.includes(newParentId)) {
          this.rebuildFromCurrentTree();
          return;
        }
        newParents = existingParents.filter((p: string) => p !== fromParentId);
        if (!newParents.includes(newParentId)) {
          newParents.push(newParentId);
        }
        if (this.wouldCreateCycle(draggedId, newParents)) {
          this.snackBar.open('Cannot move here: would create a circular reference.', '', { duration: 3000, panelClass: ['snackbar-error'] });
          return;
        }
      } else {
        newParents = existingParents.filter((p: string) => p !== fromParentId);
      }

      if (fromParentId) {
        const fromParentNode = allNodes.find((n) => n.id === fromParentId);
        if (fromParentNode) {
          const idx = fromParentNode.children.findIndex((c) => c.id === draggedId);
          if (idx >= 0) fromParentNode.children.splice(idx, 1);
        }
      } else {
        const idx = this.treeNodes().indexOf(draggedNode);
        if (idx >= 0) this.treeNodes().splice(idx, 1);
      }

      if (newParentId) {
        const targetNode = allNodes.find((n) => n.id === newParentId);
        if (targetNode) {
          draggedNode._parentRefs = [targetNode];
          targetNode.children.push(draggedNode);
        }
      } else {
        draggedNode._parentRefs = [];
        this.treeNodes().push(draggedNode);
      }

      this.rebuildFromCurrentTree();
      this.updateFlatItemParents(draggedId, newParents);
      this.persistParentChange(draggedId, newParents);
      this.snackBar.open('Node moved.', '', { duration: 2000 });
    }
  }

  private updateFlatItemParents(entityId: string, parentIds: string[]): void {
    const item = this.flatItems.find((i: any) => i.id === entityId);
    if (item) {
      item.relToParent = {
        edges: parentIds.map((id) => ({ node: { factSheet: { id } } })),
        totalCount: parentIds.length,
      };
    }
  }

  private handleUnlink(draggedId: string, fromParentId: string | null): void {
    if (!fromParentId) {
      this.snackBar.open('No parent to unlink from.', '', { duration: 2000 });
      return;
    }

    const item = this.flatItems.find((i: any) => i.id === draggedId);
    const existingParents: string[] = extractParentIds(item?.relToParent);
    const newParents = existingParents.filter((p: string) => p !== fromParentId);

    const allNodes = this.flattenTree(this.treeNodes());

    const fromParentNode = allNodes.find((n) => n.id === fromParentId);
    if (fromParentNode) {
      const idx = fromParentNode.children.findIndex((c) => c.id === draggedId);
      if (idx >= 0) {
        fromParentNode.children.splice(idx, 1);
      }
    }

    if (newParents.length > 0) {
      const primaryParent = allNodes.find((n) => n.id === newParents[0]);
      if (primaryParent) {
        const alreadyThere = primaryParent.children.some((c) => c.id === draggedId);
        if (!alreadyThere) {
          const draggedNode = allNodes.find((n) => n.id === draggedId);
          if (draggedNode) {
            draggedNode._parentRefs = [primaryParent];
            primaryParent.children.push(draggedNode);
          }
        }
      }
    } else {
      const draggedNode = allNodes.find((n) => n.id === draggedId);
      if (draggedNode) {
        draggedNode._parentRefs = [];
        const alreadyRoot = this.treeNodes().some((r) => r.id === draggedId);
        if (!alreadyRoot) {
          this.treeNodes().push(draggedNode);
        }
      }
    }

    this.rebuildFromCurrentTree();
    this.updateFlatItemParents(draggedId, newParents);
    this.persistParentChange(draggedId, newParents);
    this.snackBar.open(newParents.length > 0 ? 'Unlinked from parent.' : 'Moved to root level.', '', { duration: 2000 });
  }

  private wouldCreateCycle(draggedId: string, newParentIds: string[]): boolean {
    const visited = new Set<string>();
    const stack = [...newParentIds];
    while (stack.length > 0) {
      const currentId = stack.pop()!;
      if (currentId === draggedId) return true;
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      const item = this.flatItems.find((i: any) => i.id === currentId);
      const parents = extractParentIds(item?.relToParent);
      for (const pid of parents) {
        stack.push(pid);
      }
    }
    return false;
  }

  private persistParentChange(entityId: string, parentIds: string[]): void {
    const entityType = this.getEntityType();
    const patch: Record<string, unknown> = {};
    patch['relToParent'] = {
      edges: parentIds.map((id) => ({ node: { factSheet: { id } } })),
      totalCount: parentIds.length,
    };
    this.entityApi.patchEntity(entityId, patch, entityType).subscribe();
  }

  private isDescendant(node: TreeNode, targetId: string): boolean {
    for (const child of node.children) {
      if (child.id === targetId) return true;
      if (this.isDescendant(child, targetId)) return true;
    }
    return false;
  }

  private detachNode(node: TreeNode): void {
    const hadParents = node._parentRefs.length > 0;
    for (const parent of node._parentRefs) {
      const siblings = parent.children;
      const idx = siblings.indexOf(node);
      if (idx >= 0) siblings.splice(idx, 1);
    }
    node._parentRefs = [];
    if (!hadParents) {
      const roots = this.treeNodes();
      const idx = roots.indexOf(node);
      if (idx >= 0) roots.splice(idx, 1);
    }
  }

  private rebuildFromCurrentTree(): void {
    const roots = this.treeNodes();
    this.computeDepths(roots, 0);
    this.sortTree(roots);
    this.treeNodes.set([...roots]);
  }

  private flattenTree(nodes: TreeNode[]): TreeNode[] {
    const result: TreeNode[] = [];
    const walk = (list: TreeNode[]): void => {
      for (const n of list) {
        result.push(n);
        walk(n.children);
      }
    };
    walk(nodes);
    return result;
  }

  getCategoryIcon(category?: string): string {
    switch (category) {
      case 'businessUnit': return 'business';
      case 'region': return 'public';
      case 'legalEntity': return 'gavel';
      case 'team': return 'groups';
      default: return 'category';
    }
  }

  getCategoryLabel(category?: string): string {
    switch (category) {
      case 'businessUnit': return 'Business Unit';
      case 'region': return 'Region';
      case 'legalEntity': return 'Legal Entity';
      case 'team': return 'Team';
      default: return category || '';
    }
  }

  getEntityType(): string {
    return this.entityType() === 'UserGroups' ? 'UserGroup' : 'BusinessCapability';
  }

  onEditEntity(node: TreeNode, event: MouseEvent): void {
    event.stopPropagation();
    const entityType = this.getEntityType();
    const url = this.userConfig.projectUrlString(`entity/${entityType}/${node.id}`);
    window.open(url, '_blank');
  }

  onToggleStatus(node: TreeNode, event: MouseEvent): void {
    event.stopPropagation();
    const newStatus = node.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
    this.entityApi.patchEntity(node.id, { status: newStatus }, this.getEntityType()).subscribe({
      next: () => {
        node.status = newStatus;
        if (node._original) node._original.status = newStatus;
        this.treeNodes.set([...this.treeNodes()]);
        this.snackBar.open(`Status changed to ${newStatus}`, '', { duration: 2000 });
      },
      error: () => {
        this.snackBar.open('Failed to update status', '', { duration: 3000, panelClass: ['snackbar-error'] });
      },
    });
  }

  onAppCountClick(node: TreeNode, event: MouseEvent): void {
    event.stopPropagation();
    const entityType = this.entityType();
    const param = entityType === 'BusinessCapabilities' ? 'bizCap' : 'userGroup';
    const url = this.userConfig.projectUrlString(`list/Applications?${param}=${node.id}`);
    window.open(url, '_blank');
  }

  async onExport(): Promise<void> {
    const roots = this.treeNodes();
    if (roots.length === 0) return;
    this.snackBar.open('Export started…', '', { duration: 3000 });

    const [ExcelJSModule, FileSaverModule] = await Promise.all([import('exceljs'), import('file-saver')]);
    const ExcelJSDefault = ExcelJSModule.default;
    const saveAsFn = (FileSaverModule as any)?.saveAs ?? (FileSaverModule as any)?.default ?? FileSaverModule;
    if (typeof saveAsFn !== 'function') return;

    const wb = new ExcelJSDefault.Workbook();
    const sheetName = this.entityType() === 'UserGroups' ? 'User Groups' : 'Business Capabilities';
    const ws = wb.addWorksheet(sheetName);

    ws.columns = [
      { header: 'ID', key: 'id', width: 15 },
      { header: 'Name', key: 'name', width: 50 },
      { header: 'Additional Parents', key: 'additionalParents', width: 30 },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Direct Applications', key: 'direct', width: 18 },
      { header: 'Indirect Applications', key: 'indirect', width: 20 },
    ];
    ws.getColumn(1).hidden = true;

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };

    ws.properties = { ...ws.properties, outlineProperties: { summaryBelow: false, summaryRight: true } };

    for (let i = 1; i <= ws.columns.length; i++) {
      ws.getColumn(i).alignment = { vertical: 'top' };
    }
    ws.getColumn(5).alignment = { horizontal: 'center', vertical: 'top' };
    ws.getColumn(6).alignment = { horizontal: 'center', vertical: 'top' };

    const flattenTree = (nodes: TreeNode[], depth: number): void => {
      for (const node of nodes) {
        const row = ws.addRow([
          node.id,
          node.displayName,
          node._additionalParentNames ?? '',
          node.description ?? '',
          node._directCount ?? 0,
          node._indirectCount ?? 0,
        ]);
        row.getCell(2).alignment = { indent: depth, vertical: 'top' };
        row.outlineLevel = depth;
        flattenTree(node.children, depth + 1);
      }
    };

    flattenTree(roots, 0);

    const buffer = await wb.xlsx.writeBuffer();
    const fileName = this.entityType() === 'UserGroups' ? 'user-groups.xlsx' : 'business-capabilities.xlsx';
    saveAsFn(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      fileName,
    );
  }

  onNewEntity(): void {
    const entityType = this.getEntityType();
    const guid = crypto.randomUUID();
    const url = this.userConfig.projectUrlString(`entity/${entityType}/${guid}`);
    window.open(url, '_blank');
  }
}
