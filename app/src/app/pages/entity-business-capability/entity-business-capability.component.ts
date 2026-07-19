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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslateModule } from '@ngx-translate/core';
import { EditFieldComponent } from '../../components/edit-field/edit-field.component';
import { EntityApiService } from '../../services/entity-api.service';

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
}

@Component({
  selector: 'app-entity-business-capability',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    TranslateModule,
    EditFieldComponent,
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
            [value]="selectedParentIds()"
            (selectionChange)="onParentsChange($event.value)"
            multiple
          >
            @for (opt of parentOptions(); track opt.id) {
              <mat-option [value]="opt.id">{{ opt.displayName }}</mat-option>
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

  private dataVersion = signal(0);
  private allCapabilities = signal<ParentOption[]>([]);

  parentOptions = computed(() => {
    this.dataVersion();
    const currentId = this.guid();
    return this.allCapabilities().filter((c) => c.id !== currentId);
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
          }));
        this.allCapabilities.set(options);
      },
    });
  }
}
