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
  OnInit,
  ChangeDetectorRef,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslatePipe } from '@ngx-translate/core';
import { EntityApiService } from '../../services/entity-api.service';
import { UserConfigService } from '../../services/user-config.service';
import { ApplicationsService, ApplicationItem } from '../../services/ApplicationsService';

export interface TreeNode {
  id: string;
  displayName: string;
  description?: string;
  countryIsoCode?: string;
  category?: string;
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
  imports: [CommonModule, MatButtonModule, MatIconModule, MatSnackBarModule, TranslatePipe],
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

  readonly loading = signal(true);
  readonly pageTitle = signal('');
  readonly treeNodes = signal<TreeNode[]>([]);
  readonly expandedIds = signal(new Set<string>());
  readonly entityType = signal('');
  readonly draggedNodeId = signal<string | null>(null);
  readonly draggedFromParentId = signal<string | null>(null);
  readonly draggedNodeRef = signal<TreeNode | null>(null);
  readonly dropTargetId = signal<string | null>(null);

  private flatItems: any[] = [];
  private pendingRoots: TreeNode[] = [];
  private pendingRelationKey: 'relApplicationToBusinessCapability' | 'relApplicationToUserGroup' | null = null;

  constructor() {
    effect(() => {
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
      this.entityApi.listBusinessCapabilities().subscribe({
        next: (body: any) => {
          const raw = Array.isArray(body) ? body : (body?.businessCapabilities ?? []);
          const items = Array.isArray(raw) ? raw : [];
          this.flatItems = items;
          const roots = this.buildTreeFromRelToParent(items);
          this.computeAppCounts(roots, 'relApplicationToBusinessCapability');
          this.computeAdditionalParents(roots);
          this.treeNodes.set(roots);
          this.loading.set(false);
          this.expandFirstLevels(2);
          this.cdr.detectChanges();
        },
        error: () => { this.loading.set(false); },
      });
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
          this.expandFirstLevels(2);
          this.cdr.detectChanges();
        },
        error: () => { this.loading.set(false); },
      });
    } else {
      this.loading.set(false);
    }
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

  private buildTreeFromRelToParent(items: { id: string; displayName: string; parentIds?: string[]; description?: string }[]): TreeNode[] {
    const itemMap = new Map<string, any>();
    for (const item of items) {
      itemMap.set(item.id, item);
    }

    const createNode = (id: string): TreeNode => {
      const item = itemMap.get(id);
      const segments = (item?.displayName || '').split('/').map((s: string) => s.trim()).filter(Boolean);
      const shortName = segments.length > 0 ? segments[segments.length - 1] : (item?.displayName || id);
      return {
        id,
        displayName: shortName,
        description: item?.description,
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

    for (const item of items) {
      const parents = item.parentIds ?? [];
      const primary = primaryNodes.get(item.id)!;

      if (parents.length === 0) {
        roots.push(primary);
        placed.add(item.id);
        continue;
      }

      const validParents = parents.filter((p) => itemMap.has(p));

      if (validParents.length > 0) {
        const firstParent = primaryNodes.get(validParents[0])!;
        firstParent.children.push(primary);
        primary._parentRefs.push(firstParent);
        placed.add(item.id);
      } else {
        roots.push(primary);
        placed.add(item.id);
      }

      for (let i = 1; i < validParents.length; i++) {
        const dupe = createNode(item.id);
        const parentNode = primaryNodes.get(validParents[i])!;
        parentNode.children.push(dupe);
        dupe._parentRefs.push(parentNode);
      }
    }

    this.computeDepths(roots, 0);
    this.sortTree(roots);
    return roots;
  }

  private buildTreeFromParentField(items: { id: string; displayName: string; parentIds?: string[]; description?: string; countryIsoCode?: string; category?: string }[]): TreeNode[] {
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

    for (const item of items) {
      const parents = item.parentIds ?? [];
      const primary = primaryNodes.get(item.id)!;

      if (parents.length === 0) {
        roots.push(primary);
        continue;
      }

      const validParents = parents.filter((p) => itemMap.has(p));

      if (validParents.length > 0) {
        const firstParent = primaryNodes.get(validParents[0])!;
        firstParent.children.push(primary);
        primary._parentRefs.push(firstParent);
      } else {
        roots.push(primary);
      }

      for (let i = 1; i < validParents.length; i++) {
        const dupe = createNode(item.id);
        const parentNode = primaryNodes.get(validParents[i])!;
        parentNode.children.push(dupe);
        dupe._parentRefs.push(parentNode);
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
    nodes.sort((a, b) => a.displayName.localeCompare(b.displayName));
    for (const n of nodes) this.sortTree(n.children);
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
      const rel = (app as any)[relationKey];
      if (!Array.isArray(rel)) continue;
      for (const ref of rel) {
        if (!ref?.id) continue;
        if (!directCounts.has(ref.id)) directCounts.set(ref.id, new Set());
        directCounts.get(ref.id)!.add(app.id);
      }
    }
    console.log('[computeAppCounts] directCounts size:', directCounts.size, 'sample root:', roots[0]?.id, roots[0]?.displayName, 'direct:', directCounts.get(roots[0]?.id ?? '')?.size ?? 0);

    const collectDescendantIds = (node: TreeNode): Set<string> => {
      const ids = new Set<string>([node.id]);
      for (const child of node.children) {
        for (const id of collectDescendantIds(child)) ids.add(id);
      }
      return ids;
    };

    const walk = (nodes: TreeNode[]): void => {
      for (const node of nodes) {
        const directApps = directCounts.get(node.id) ?? new Set();
        node._directCount = directApps.size;

        const descendantIds = collectDescendantIds(node);
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
        const parentIds: string[] = item?.parentIds ?? [];
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
    return node.id;
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
      const existingParents: string[] = item?.parentIds ?? (item?.parentId ? [item.parentId] : []);
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
      const existingParents: string[] = item?.parentIds ?? (item?.parentId ? [item.parentId] : []);
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
      item.parentIds = parentIds;
    }
  }

  private handleUnlink(draggedId: string, fromParentId: string | null): void {
    if (!fromParentId) {
      this.snackBar.open('No parent to unlink from.', '', { duration: 2000 });
      return;
    }

    const item = this.flatItems.find((i: any) => i.id === draggedId);
    const existingParents: string[] = item?.parentIds ?? [];
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
      const parents = item?.parentIds ?? [];
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

  onAppCountClick(node: TreeNode, event: MouseEvent): void {
    event.stopPropagation();
    const entityType = this.entityType();
    const param = entityType === 'BusinessCapabilities' ? 'bizCap' : 'userGroup';
    const url = this.userConfig.projectUrlString(`list/Applications?${param}=${node.id}`);
    window.open(url, '_blank');
  }

  onNewEntity(): void {
    const entityType = this.getEntityType();
    const guid = crypto.randomUUID();
    const url = this.userConfig.projectUrlString(`entity/${entityType}/${guid}`);
    window.open(url, '_blank');
  }
}
