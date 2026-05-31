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

import { Component, inject, signal, OnInit, OnDestroy, effect } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms';
import { EntityApiService } from '../../services/entity-api.service';
import { ServiceCatalogService } from '../../services/ServiceCatalogService';
import { ListEntities200ResponseInner } from '../../services/api/model/listEntities200ResponseInner';
import { PageTitleService } from '../../services/page-title.service';
import { AuthorizationService } from '../../services/authorization.service';
import { UserConfigService } from '../../services/user-config.service';

interface TreeNode {
  id: string;
  displayName: string;
  description?: string;
  children?: TreeNode[];
  applications?: { id: string; displayName: string }[];
  services?: { id: string; displayName: string; description?: string }[];
  loaded?: boolean;
  isLoading?: boolean;
}

@Component({
  selector: 'app-service-catalog-list',
  standalone: true,
  imports: [
    CommonModule,
    NgTemplateOutlet,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatCheckboxModule,
    FormsModule,
  ],
  templateUrl: './service-catalog-list.component.html',
  styleUrl: './service-catalog-list.component.scss',
})
export class ServiceCatalogListComponent implements OnInit, OnDestroy {
  private entityService = inject(EntityApiService);
  private serviceCatalogService = inject(ServiceCatalogService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private pageTitleService = inject(PageTitleService);
  private authorization = inject(AuthorizationService);
  private userConfig = inject(UserConfigService);

  readonly canEdit = this.authorization.canEdit;

  loading = signal(true);
  error = signal<string | null>(null);
  items = signal<ListEntities200ResponseInner[]>([]);
  showTree = signal(false);

  private treeNodeState = signal<Map<string, { loaded: boolean; loading: boolean; children: TreeNode[]; applications: { id: string; displayName: string }[]; services: { id: string; displayName: string; description?: string }[] }>>(new Map());

  currentParentId = signal<string | null>(null);
  currentParentName = signal<string>('');
  breadcrumbs = signal<{ id: string | null; displayName: string }[]>([{ id: null, displayName: 'Root' }]);

  private allItems = signal<ListEntities200ResponseInner[]>([]);

  private _catalogEffect = effect(() => {
    const items = this.serviceCatalogService.items();
    const loading = this.serviceCatalogService.loading();
    this.loading.set(loading);
    if (items.length > 0) {
      this.allItems.set(items);
      this.applyParentFilter();
      this.reSortTreeNodeStateChildren();
    }
  });

  private reSortTreeNodeStateChildren(): void {
    this.treeNodeState.update((state) => {
      const needsUpdate = [...state.values()].some((s) => s.loaded);
      if (!needsUpdate) return state;
      const newState = new Map(state);
      for (const [nodeId, nodeState] of newState) {
        if (nodeState.loaded) {
          const sortedChildren = this.serviceCatalogService.getItemsByParent(nodeId).map((item) => ({
            id: item.id ?? '',
            displayName: item.displayName ?? '',
            description: item.description ?? undefined,
          }));
          newState.set(nodeId, { ...nodeState, children: sortedChildren });
        }
      }
      return newState;
    });
  }

  private urlSubscription: any;
  private queryParamsSubscription: any;

  ngOnInit(): void {
    this.pageTitleService.setTitle('Service Catalog');
    this.serviceCatalogService.ensureLoaded();

    this.queryParamsSubscription = this.route.queryParams.subscribe(() => {
      this.reloadForMode();
    });
    this.urlSubscription = this.route.url.subscribe((segments) => {
      this.currentSegments = segments.slice(2).map((s) => s.path);
      this.reloadForMode();
    });
  }

  private currentSegments: string[] = [];
  private lastReloadKey = '';

  private reloadForMode(): void {
    const isTree = this.route.snapshot.queryParams['mode'] === 'tree';
    this.showTree.set(isTree);
    const key = `${isTree ? 'tree' : 'tile'}|${this.currentSegments.join('/')}`;
    if (key === this.lastReloadKey) return;
    this.lastReloadKey = key;

    if (this.currentSegments.length === 0) {
      this.breadcrumbs.set([{ id: null, displayName: 'Root' }]);
      this.currentParentId.set(null);
      this.currentParentName.set('');
      this.loadItems('null');
      return;
    }
    if (isTree) {
      this.loadTreeFromPath(this.currentSegments);
    } else {
      this.parsePathAndLoad(this.currentSegments);
    }
  }

  ngOnDestroy(): void {
    this.urlSubscription?.unsubscribe();
    this.queryParamsSubscription?.unsubscribe();
  }

  private parsePathAndLoad(pathSegments: string[]): void {
    if (pathSegments.length === 0) {
      this.loadItems('null');
      return;
    }
    this.breadcrumbs.set([{ id: null, displayName: 'Root' }]);
    this.loadPathSegments(pathSegments, 0);
  }

  private loadTreeFromPath(segments: string[]): void {
    const items = this.serviceCatalogService.items();
    if (items.length === 0) {
      this.loading.set(true);
      return;
    }
    this.items.set(this.serviceCatalogService.rootItems());
    this.allItems.set(items);
    if (!segments.length) {
      this.loading.set(false);
      return;
    }
    this.expandBreadcrumbChain(segments, 0, () => {
      this.loading.set(false);
    });
  }

  private expandBreadcrumbChain(segments: string[], index: number, done: () => void): void {
    if (index >= segments.length) {
      done();
      return;
    }
    const segment = segments[index];
    const match = segment.match(/^(.+)-(.+)$/);
    let id: string;
    let displayName: string;
    if (match) {
      id = match[1];
      displayName = decodeURIComponent(match[2]);
    } else {
      id = segment;
      displayName = 'Loading...';
    }

    this.currentParentId.set(id);
    this.currentParentName.set(displayName);
    this.breadcrumbs.update((crumbs) => [
      ...crumbs,
      { id, displayName },
    ]);

    this.treeNodeState.update((state) => {
      const newState = new Map(state);
      newState.set(id, { loaded: false, loading: true, children: [], applications: [], services: [] });
      return newState;
    });

    const children = this.serviceCatalogService.getItemsByParent(id).map((item) => ({
      id: item.id ?? '',
      displayName: item.displayName ?? '',
      description: item.description ?? undefined,
    }));

    this.entityService.getServiceCatalogSection(id).subscribe({
      next: (fullItem: any) => {
        const applications: { id: string; displayName: string }[] = [];
        const appsData = fullItem?.applications;
        if (appsData?.edges) {
          for (const edge of appsData.edges) {
            const fs = edge.node?.factSheet;
            if (fs?.displayName) {
              applications.push({ id: String(fs['id'] ?? ''), displayName: String(fs['displayName']) });
            }
          }
        }

        const services: { id: string; displayName: string; description?: string }[] = [];
        const servicesData = fullItem?.services;
        if (servicesData?.edges) {
          for (const edge of servicesData.edges) {
            const fs = edge.node?.factSheet;
            if (fs?.displayName) {
              services.push({ id: String(fs['id'] ?? ''), displayName: String(fs['displayName']), description: fs['description'] ?? undefined });
            }
          }
        }

        this.treeNodeState.update((state) => {
          const newState = new Map(state);
          newState.set(id, { loaded: true, loading: false, children, applications, services });
          return newState;
        });

        this.expandBreadcrumbChain(segments, index + 1, done);
      },
      error: () => {
        this.treeNodeState.update((state) => {
          const newState = new Map(state);
          newState.set(id, { loaded: true, loading: false, children, applications: [], services: [] });
          return newState;
        });
        this.expandBreadcrumbChain(segments, index + 1, done);
      },
    });
  }

  private loadPathSegments(segments: string[], index: number): void {
    if (index >= segments.length) {
      const parentId = this.currentParentId();
      this.loadItems(parentId ?? undefined);
      return;
    }
    const segment = segments[index];
    const match = segment.match(/^(.+)-(.+)$/);
    let id: string;
    let displayName: string;
    if (match) {
      id = match[1];
      displayName = decodeURIComponent(match[2]);
    } else {
      id = segment;
      displayName = 'Loading...';
    }
    this.currentParentId.set(id);
    this.currentParentName.set(displayName);
    this.breadcrumbs.update((crumbs) => [
      ...crumbs,
      { id, displayName },
    ]);
    this.loadPathSegments(segments, index + 1);
  }

  private applyParentFilter(): void {
    const parentId = this.currentParentId();
    const items = this.serviceCatalogService.getItemsByParent(parentId);
    this.items.set(items);
    this.loading.set(false);
  }

  private loadItems(parentFilter: string | undefined): void {
    const parentId = parentFilter === 'null' ? null : (parentFilter ?? null);
    this.currentParentId.set(parentId);
    this.applyParentFilter();
  }

  onToggleTree(): void {
    const next = !this.showTree();
    if (next) {
      this.router.navigate([], { relativeTo: this.route, queryParams: { mode: 'tree' }, queryParamsHandling: 'merge' });
    } else {
      const current = { ...this.route.snapshot.queryParams };
      delete current['mode'];
      this.router.navigate([], { relativeTo: this.route, queryParams: current, replaceUrl: true });
    }
  }

  getTileItems(): ListEntities200ResponseInner[] {
    return this.items();
  }

  getAllItems(): ListEntities200ResponseInner[] {
    return this.allItems();
  }

  getTreeNodes(): TreeNode[] {
    return this.items().map((item) => {
      const id = item.id ?? '';
      const state = this.treeNodeState().get(id);
      return {
        id,
        displayName: item.displayName ?? '',
        description: item.description ?? undefined,
        loaded: state?.loaded ?? false,
        isLoading: state?.loading ?? false,
        children: state?.children,
        applications: state?.applications,
        services: state?.services,
      };
    });
  }

  getNodeChildren(parentId: string): TreeNode[] {
    const state = this.treeNodeState().get(parentId);
    if (!state || !state.loaded) return [];
    return (state.children ?? []).map((child) => {
      const childState = this.treeNodeState().get(child.id);
      return {
        ...child,
        loaded: childState?.loaded ?? false,
        isLoading: childState?.loading ?? false,
        children: childState?.children,
        applications: childState?.applications,
        services: childState?.services,
      };
    });
  }

private getReturnToParam(): string {
    const crumbs = this.breadcrumbs();
    const pathParts = crumbs
      .filter((c) => c.id !== null)
      .map((c) => `${c.id}-${encodeURIComponent(c.displayName)}`);
    const suffix = pathParts.length === 0
      ? 'list/ServiceCatalog'
      : 'list/ServiceCatalog/' + pathParts.join('/');
    return this.userConfig.projectUrlString(suffix);
  }

  onTileClick(item: ListEntities200ResponseInner): void {
    const itemAny = item as any;
    const abstractValue = itemAny['abstract'];

    if (abstractValue !== true) {
      const returnTo = this.getReturnToParam();
      this.router.navigate(this.userConfig.projectUrl(['entity', 'ServiceCatalogSection', item.id ?? '']), { state: { returnTo } });
    } else {
      this.router.navigate(this.userConfig.projectUrl(this.buildCascadingPath(item.id ?? '', item.displayName ?? '')));
    }
  }

  onTileEdit(item: ListEntities200ResponseInner): void {
    const id = item.id ?? '';
    const returnTo = this.getReturnToParam();
    this.router.navigate(this.userConfig.projectUrl(['entity', 'ServiceCatalogSection', id]), { state: { returnTo } });
  }

  private buildCascadingPath(id: string, displayName: string): any[] {
    const crumbs = this.breadcrumbs();
    const pathParts = crumbs
      .filter((c) => c.id !== null)
      .map((c) => `${c.id}-${encodeURIComponent(c.displayName)}`);
    if (id && displayName) {
      pathParts.push(`${id}-${encodeURIComponent(displayName)}`);
    }
    return ['list', 'ServiceCatalog', ...pathParts];
  }

  onBreadcrumbClick(index: number): void {
    const crumbs = this.breadcrumbs();
    if (index < 0) {
      this.breadcrumbs.set([{ id: null, displayName: 'Root' }]);
      this.currentParentId.set(null);
      this.currentParentName.set('');
      this.router.navigate(this.userConfig.projectUrl(['list', 'ServiceCatalog']));
    } else if (index < crumbs.length) {
      const selectedCrumbs = crumbs.slice(0, index + 1);
      const crumb = selectedCrumbs[selectedCrumbs.length - 1];
      this.breadcrumbs.set(selectedCrumbs);
      this.currentParentId.set(crumb.id);
      this.currentParentName.set(crumb.displayName);
      if (crumb.id) {
        const pathParts = selectedCrumbs
          .filter((c) => c.id !== null)
          .map((c) => `${c.id}-${encodeURIComponent(c.displayName)}`);
        this.router.navigate(this.userConfig.projectUrl(['list', 'ServiceCatalog', ...pathParts]));
      } else {
        this.router.navigate(this.userConfig.projectUrl(['list', 'ServiceCatalog']));
      }
    }
  }

  onTreeNodeExpand(node: TreeNode): void {
    if (node.loaded) return;

    this.treeNodeState.update((state) => {
      const newState = new Map(state);
      newState.set(node.id, { loaded: false, loading: true, children: [], applications: [], services: [] });
      return newState;
    });

    const children = this.serviceCatalogService.getItemsByParent(node.id).map((item) => ({
      id: item.id ?? '',
      displayName: item.displayName ?? '',
      description: item.description ?? undefined,
    }));

    this.entityService.getServiceCatalogSection(node.id).subscribe({
      next: (fullItem: any) => {
        const applications: { id: string; displayName: string }[] = [];
        const appsData = fullItem?.applications;
        if (appsData?.edges) {
          for (const edge of appsData.edges) {
            const fs = edge.node?.factSheet;
            if (fs?.displayName) {
              applications.push({ id: String(fs['id'] ?? ''), displayName: String(fs['displayName']) });
            }
          }
        }

        const services: { id: string; displayName: string; description?: string }[] = [];
        const servicesData = fullItem?.services;
        if (servicesData?.edges) {
          for (const edge of servicesData.edges) {
            const fs = edge.node?.factSheet;
            if (fs?.displayName) {
              services.push({ id: String(fs['id'] ?? ''), displayName: String(fs['displayName']), description: fs['description'] ?? undefined });
            }
          }
        }

        this.treeNodeState.update((state) => {
          const newState = new Map(state);
          newState.set(node.id, { loaded: true, loading: false, children, applications, services });
          return newState;
        });
      },
      error: () => {
        this.treeNodeState.update((state) => {
          const newState = new Map(state);
          newState.set(node.id, { loaded: true, loading: false, children, applications: [], services: [] });
          return newState;
        });
      },
    });
  }

  onTreeNodeToggle(node: TreeNode): void {
    const currentState = this.treeNodeState().get(node.id);
    if (currentState?.loaded) {
      this.treeNodeState.update((state) => {
        const newState = new Map(state);
        newState.set(node.id, { loaded: false, loading: false, children: [], applications: [], services: [] });
        return newState;
      });
    } else {
      this.onTreeNodeExpand(node);
    }
  }

  onTileClickById(id: string): void {
    this.router.navigate(this.userConfig.projectUrl(['entity', 'ServiceCatalogSection', id]));
  }

  onNew(): void {
    const guid = crypto.randomUUID();
    const parentId = this.currentParentId();
    const returnTo = this.getReturnToParam();
    if (parentId) {
      this.router.navigate(this.userConfig.projectUrl(['entity', 'ServiceCatalogSection', guid]), { queryParams: { parent: parentId }, state: { returnTo } });
    } else {
      this.router.navigate(this.userConfig.projectUrl(['entity', 'ServiceCatalogSection', guid]), { state: { returnTo } });
    }
  }

  getBreadcrumbs(): { id: string | null; displayName: string }[] {
    return this.breadcrumbs();
  }
}
