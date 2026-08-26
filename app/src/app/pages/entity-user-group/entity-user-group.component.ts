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

import { Component, input, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslatePipe } from '@ngx-translate/core';
import { EditFieldComponent } from '../../components/edit-field/edit-field.component';
import { EntityApiService } from '../../services/entity-api.service';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { matchesSearch } from '../../utils/search-utils';

export interface UserGroupData {
  type?: string;
  id?: string;
  displayName?: string;
  description?: string | null;
  level?: number | null;
  parentIds?: string[];
  status?: string | null;
  category?: string | null;
  countryIsoCode?: string | null;
  [key: string]: unknown;
}

interface ParentOption {
  id: string;
  displayName: string;
  level: number;
  parentIds?: string[];
}

interface TreeOption {
  id: string;
  label: string;
  depth: number;
  hidden: boolean;
}

function buildParentTree(items: ParentOption[], currentId: string): TreeOption[] {
  const filtered = items.filter((c) => c.id !== currentId);
  const itemMap = new Map<string, ParentOption>();
  for (const item of filtered) itemMap.set(item.id, item);

  const nodeMap = new Map<string, TreeOption>();
  for (const item of filtered) {
    nodeMap.set(item.id, { id: item.id, label: item.displayName || item.id, depth: 0, hidden: false });
  }

  const childrenOf = new Map<string, string[]>();
  for (const item of filtered) {
    for (const pid of (item.parentIds ?? []).filter((p) => itemMap.has(p))) {
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      childrenOf.get(pid)!.push(item.id);
    }
  }

  const roots: TreeOption[] = [];
  const visited = new Set<string>();

  const emit = (nodeId: string, depth: number): void => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const n = nodeMap.get(nodeId);
    if (n) { n.depth = depth; roots.push(n); }
    for (const childId of (childrenOf.get(nodeId) ?? [])) {
      emit(childId, depth + 1);
    }
  };

  for (const item of filtered) {
    if (visited.has(item.id)) continue;
    let root = item.id;
    const seen = new Set<string>();
    let cur = item.id;
    while (true) {
      seen.add(cur);
      const parents = (itemMap.get(cur)?.parentIds ?? []).filter((p) => itemMap.has(p));
      if (parents.length === 0 || seen.has(parents[0])) break;
      cur = parents[0];
    }
    root = cur;
    emit(root, 0);
  }

  return roots;
}

@Component({
  selector: 'app-entity-user-group',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    TranslatePipe,
    EditFieldComponent,
    NgxMatSelectSearchModule,
  ],
  templateUrl: './entity-user-group.component.html',
  styleUrl: './entity-user-group.component.scss',
})
export class EntityUserGroupComponent implements OnInit {
  guid = input.required<string>();
  data = input.required<UserGroupData | null>();
  onDataMutated = input<() => void>(() => {});
  readOnly = input<boolean>(false);

  private entityApi = inject(EntityApiService);

  private dataVersion = signal(0);
  private allGroups = signal<ParentOption[]>([]);
  private parentSearchValue = signal('');

  readonly parentFilterCtrl = new FormControl<string[]>([]);
  readonly parentSearchCtrl = new FormControl('');
  readonly statusOptions = ['ACTIVE', 'INACTIVE'];
  readonly categoryOptions = ['region', 'businessUnit', 'legalEntity', 'team'];

  parentOptions = computed(() => {
    this.dataVersion();
    const currentId = this.guid();
    return this.allGroups().filter((g) => g.id !== currentId);
  });

  private parentTree = computed(() => buildParentTree(this.parentOptions(), this.guid()));

  filteredParentTree = computed(() => {
    const q = this.parentSearchValue();
    const tree = this.parentTree();
    if (!q) {
      for (const opt of tree) opt.hidden = false;
      return tree;
    }
    const matchingIds = new Set<string>();
    for (const opt of this.parentOptions()) {
      if (matchesSearch(q, opt.displayName)) matchingIds.add(opt.id);
    }
    const keepIds = new Set<string>();
    for (const id of matchingIds) {
      let cur = id;
      const itemMap = new Map(this.parentOptions().map((o) => [o.id, o]));
      while (cur && !keepIds.has(cur)) {
        keepIds.add(cur);
        const parents = itemMap.get(cur)?.parentIds ?? [];
        cur = parents.length > 0 ? parents[0] : '';
      }
    }
    for (const opt of tree) opt.hidden = !keepIds.has(opt.id);
    return tree;
  });

  selectedParentIds = computed(() => {
    this.dataVersion();
    const d = this.data();
    if (!d) return [];
    if (d.parentIds) return d.parentIds;
    return this.extractParentIdsFromRelToParent(d['relToParent']);
  });

  parentDisplayNames = computed(() => {
    this.dataVersion();
    const ids = this.selectedParentIds();
    return ids.map((id) => {
      const match = this.allGroups().find((g) => g.id === id);
      return match?.displayName ?? id;
    });
  });

  computedLevel = computed(() => {
    this.dataVersion();
    const d = this.data();
    if (!d) return 0;
    const ids = this.selectedParentIds();
    if (d.level != null && ids.length === 0) return d.level;
    let maxLevel = -1;
    for (const parentId of ids) {
      const parent = this.allGroups().find((g) => g.id === parentId);
      if (parent && parent.level > maxLevel) {
        maxLevel = parent.level;
      }
    }
    return maxLevel >= 0 ? maxLevel + 1 : 0;
  });

  ngOnInit(): void {
    this.loadParentOptions();
    this.parentSearchCtrl.valueChanges.subscribe((v) => this.parentSearchValue.set(v ?? ''));
    const ids = this.selectedParentIds();
    if (ids.length > 0) {
      setTimeout(() => this.parentFilterCtrl.setValue(ids, { emitEvent: false }), 0);
    }
  }

  onFieldMutated = (): void => {
    this.dataVersion.update((v) => v + 1);
    this.onDataMutated()?.();
  };

  onParentsChange(parentIds: string[]): void {
    const d = this.data();
    if (!d) return;
    d['relToParent'] = {
      edges: parentIds.map((id) => ({ node: { factSheet: { id } } })),
      totalCount: parentIds.length,
    };
    this.dataVersion.update((v) => v + 1);
    this.onDataMutated()?.();
  }

  extractParentIdsFromRelToParent(relToParent: any): string[] {
    if (!relToParent || typeof relToParent !== 'object') return [];
    const edges = relToParent.edges;
    if (!Array.isArray(edges)) return [];
    return edges
      .map((e: any) => e?.node?.factSheet?.id)
      .filter((id: any): id is string => typeof id === 'string' && id.length > 0);
  }

  private loadParentOptions(): void {
    this.entityApi.listUserGroups().subscribe({
      next: (body: any) => {
        const raw = Array.isArray(body) ? body : (body?.userGroups ?? []);
        const items = Array.isArray(raw) ? raw : [];
        const options: ParentOption[] = items
          .filter((item: any) => item.id)
          .map((item: any) => ({
            id: item.id,
            displayName: item.displayName || item.fullName || item.id,
            level: item.level ?? 0,
            parentIds: item.parentIds,
          }));
        this.allGroups.set(options);
      },
    });
  }
}
