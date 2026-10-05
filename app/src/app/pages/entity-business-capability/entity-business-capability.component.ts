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
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { EditFieldComponent } from '../../components/edit-field/edit-field.component';
import { EntityApiService } from '../../services/entity-api.service';
import { UserConfigService } from '../../services/user-config.service';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { matchesSearch } from '../../utils/search-utils';
import { extractParentIds } from '../../utils/parent-utils';
import { sortBySortOrder } from '../../utils/sort-order';
import { buildFacetTreeOptions, FacetTreeOption } from '../../utils/facet-tree-utils';

export interface BusinessCapabilityData {
  type?: string;
  id?: string;
  displayName?: string;
  fullName?: string;
  description?: string | null;
  status?: string;
  sortOrder?: number | null;
  relToParent?: any;
  [key: string]: unknown;
}

interface ParentOption {
  id: string;
  displayName: string;
  fullName?: string;
  sortOrder?: number | null;
  relToParent?: any;
}

interface TreeOption {
  id: string;
  trackId: string;
  label: string;
  depth: number;
  hidden: boolean;
}

function buildParentTree(items: ParentOption[], currentId: string): TreeOption[] {
  const filtered = items.filter((c) => c.id !== currentId);
  const facets = filtered.map((i) => ({
    id: i.id,
    displayName: i.displayName || i.fullName || i.id,
    fullName: i.fullName,
    relToParent: i.relToParent,
  }));
  const options = buildFacetTreeOptions(facets, '');
  return options.map((opt) => ({
    id: opt.id,
    trackId: opt.trackId ?? opt.id,
    label: opt.label,
    depth: opt.depth,
    hidden: false,
  }));
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
    MatButtonModule,
    MatIconModule,
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
      <app-edit-field
        [data]="data()!"
        field="sortOrder"
        type="number"
        label="Sort Order"
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
            @for (opt of filteredParentTree(); track opt.trackId) {
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
      @if (!readOnly()) {
        @if (childCapabilities().length > 0) {
          <div class="child-capabilities">
            <div class="child-cap-header">
              <mat-icon>account_tree</mat-icon>
              <span>Child Business Capabilities</span>
            </div>
            @for (child of childCapabilities(); track child.id) {
              <a class="child-cap-link" [href]="getChildUrl(child.id)" target="_blank" rel="noopener">
                <mat-icon>subdirectory_arrow_right</mat-icon>
                {{ child.displayName }}
              </a>
            }
          </div>
        }
        <button mat-stroked-button type="button" (click)="onCreateChild()" class="create-child-btn">
          <mat-icon>add</mat-icon>
          New Child Business Capability
        </button>
      }
      <app-edit-field
        [data]="data()!"
        field="description"
        type="richtext"
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
    .create-child-btn {
      align-self: flex-start;
    }
    .child-capabilities {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.5rem 0;
    }
    .child-cap-header {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.75rem;
      color: rgba(0, 0, 0, 0.6);
      margin-bottom: 0.25rem;

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }
    .child-cap-link {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.875rem;
      color: #1976d2;
      text-decoration: none;
      padding: 0.125rem 0;

      &:hover {
        text-decoration: underline;
      }

      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
        color: rgba(0, 0, 0, 0.45);
      }
    }
  `],
})
export class EntityBusinessCapabilityComponent implements OnInit {
  guid = input.required<string>();
  data = input.required<BusinessCapabilityData | null>();
  onDataMutated = input<() => void>(() => {});
  readOnly = input<boolean>(false);

  private entityApi = inject(EntityApiService);
  private userConfig = inject(UserConfigService);

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
        const parents = extractParentIds(itemMap.get(cur)?.relToParent);
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
    return extractParentIds(d['relToParent']);
  });

  childCapabilities = computed(() => {
    const currentId = this.guid();
    const children = this.allCapabilities().filter((c) => {
      const parents = extractParentIds(c.relToParent);
      return parents.includes(currentId);
    });
    return sortBySortOrder(children, (c) => c.sortOrder);
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

  onCreateChild(): void {
    const guid = crypto.randomUUID();
    const currentId = this.guid();
    const url = this.userConfig.projectUrlString(`entity/BusinessCapability/${guid}?parent=${currentId}`);
    window.open(url, '_blank');
  }

  getChildUrl(id: string): string {
    return this.userConfig.projectUrlString(`entity/BusinessCapability/${id}`);
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
            sortOrder: item.sortOrder,
            relToParent: item.relToParent,
          }));
        this.allCapabilities.set(options);
      },
    });
  }
}
