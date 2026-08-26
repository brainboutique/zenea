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
import { FormsModule } from '@angular/forms';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslatePipe } from '@ngx-translate/core';
import { EditFieldComponent } from '../../components/edit-field/edit-field.component';
import { EntityApiService } from '../../services/entity-api.service';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { matchesSearch } from '../../utils/search-utils';

export interface BusinessCapabilityData {
  type?: string;
  id?: string;
  displayName?: string;
  fullName?: string;
  description?: string | null;
  status?: string;
  parentIds?: string[];
  relToParent?: any;
  [key: string]: unknown;
}

interface ParentOption {
  id: string;
  displayName: string;
  fullName?: string;
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

  const createNode = (item: ParentOption): TreeOption => ({
    id: item.id,
    label: item.fullName || item.displayName || item.id,
    depth: 0,
    hidden: false,
  });

  const nodeMap = new Map<string, TreeOption>();
  for (const item of filtered) nodeMap.set(item.id, createNode(item));

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
    let cur = item.id;
    const seen = new Set<string>();
    while (true) {
      seen.add(cur);
      const parents = (itemMap.get(cur)?.parentIds ?? []).filter((p) => itemMap.has(p));
      if (parents.length === 0 || seen.has(parents[0])) break;
      cur = parents[0];
    }
    emit(cur, 0);
  }

  return roots;
}

@Component({
  selector: 'app-entity-business-capability',
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
  template: `
    <form class="entity-bc-form">
      <app-edit-field
        [data]="data()!"
        field="displayName"
        type="text"
        label="Display name"
        [readOnly]="readOnly()"
        [onMutated]="onFieldMutated"
      />
      <app-edit-field
        [data]="data()!"
        field="fullName"
        type="text"
        label="Full name"
        [readOnly]="readOnly()"
        [onMutated]="onFieldMutated"
      />

      @if (!readOnly()) {
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'Parents' | translate }}</mat-label>
          <mat-select
            [formControl]="parentFilterCtrl"
            (selectionChange)="onParentsChange($event.value)"
            multiple
            panelClass="list-facet-select-panel"
          >
            <mat-option>
              <ngx-mat-select-search
                [formControl]="parentSearchCtrl"
                placeholderLabel=""
                [noEntriesFoundLabel]="'No matching capability' | translate"
              ></ngx-mat-select-search>
            </mat-option>
            @for (opt of filteredParentTree(); track opt.id) {
              <mat-option [value]="opt.id" [class.option-hidden]="opt.hidden">
                <span [style.padding-inline-start.px]="opt.depth * 16">{{ opt.label }}</span>
              </mat-option>
            }
          </mat-select>
        </mat-form-field>
      } @else {
        <div class="readonly-field">
          <span class="readonly-label">{{ 'Parents' | translate }}</span>
          <span class="readonly-value">{{ parentDisplayNames().join(', ') || '—' }}</span>
        </div>
      }

      <app-edit-field
        [data]="data()!"
        field="status"
        type="selectSingle"
        label="Status"
        [readOnly]="readOnly()"
        [onMutated]="onFieldMutated"
        [options]="statusOptions"
      />
      <app-edit-field
        [data]="data()!"
        field="description"
        type="textarea"
        label="Description"
        [readOnly]="readOnly()"
        [onMutated]="onFieldMutated"
      />
    </form>
  `,
  styles: [`
    .entity-bc-form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 1rem;
      max-width: 100%;
      box-sizing: border-box;
    }
    .full-width { width: 100%; }
    .readonly-field {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.5rem 0;
    }
    .readonly-label {
      font-size: 0.75rem;
      color: rgba(0, 0, 0, 0.6);
    }
    .readonly-value {
      font-size: 0.875rem;
    }
  `],
})
export class EntityBusinessCapabilityComponent implements OnInit {
  guid = input.required<string>();
  data = input.required<BusinessCapabilityData | null>();
  onDataMutated = input<() => void>(() => {});
  readOnly = input<boolean>(false);

  private entityApi = inject(EntityApiService);

  readonly statusOptions = ['ACTIVE', 'ARCHIVED'];
  readonly parentFilterCtrl = new FormControl<string[]>([]);
  readonly parentSearchCtrl = new FormControl('');

  private dataVersion = signal(0);
  private allCapabilities = signal<ParentOption[]>([]);
  private parentSearchValue = signal('');

  parentOptions = computed(() => {
    this.dataVersion();
    const currentId = this.guid();
    return this.allCapabilities().filter((c) => c.id !== currentId);
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
      const name = opt.displayName || '';
      if (matchesSearch(q, name)) matchingIds.add(opt.id);
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
      const match = this.allCapabilities().find((c) => c.id === id);
      return match?.displayName ?? id;
    });
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
    this.entityApi.listBusinessCapabilities().subscribe({
      next: (body: any) => {
        const raw = Array.isArray(body) ? body : (body?.businessCapabilities ?? []);
        const items = Array.isArray(raw) ? raw : [];
        const options: ParentOption[] = items
          .filter((item: any) => item.id)
          .map((item: any) => ({
            id: item.id,
            displayName: item.displayName || item.fullName || item.id,
            parentIds: item.parentIds,
          }));
        this.allCapabilities.set(options);
      },
    });
  }
}
