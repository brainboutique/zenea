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
}

@Component({
  selector: 'app-entity-user-group',
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

  readonly statusOptions = ['ACTIVE', 'INACTIVE'];
  readonly categoryOptions = ['region', 'businessUnit', 'legalEntity', 'team'];

  parentOptions = computed(() => {
    this.dataVersion();
    const currentId = this.guid();
    return this.allGroups().filter((g) => g.id !== currentId);
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
    if (d.level != null) return d.level;
    const ids = this.selectedParentIds();
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
          }));
        this.allGroups.set(options);
      },
    });
  }
}
