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

import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
import { EntityApiService } from '../../services/entity-api.service';
import { ListEntities200ResponseInner } from '../../services/api/model/listEntities200ResponseInner';
import { TranslateModule } from '@ngx-translate/core';
import type { ReferenceEditorDialogData, ReferenceEditorItem, ReferenceTargetType } from '../../models/reference-editor-item';

@Component({
  selector: 'app-reference-editor-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    TranslateModule,
  ],
  templateUrl: './reference-editor-dialog.component.html',
  styleUrl: './reference-editor-dialog.component.scss',
})
export class ReferenceEditorDialogComponent {
  private dialogRef = inject(MatDialogRef<ReferenceEditorDialogComponent>);
  private data = inject<ReferenceEditorDialogData>(MAT_DIALOG_DATA);
  private entityApi = inject(EntityApiService);

  readonly targetType = this.data.targetType as ReferenceTargetType;

  readonly searchCtrl = new FormControl<string>('', { nonNullable: true });
  private readonly searchValue = toSignal(this.searchCtrl.valueChanges.pipe(startWith('')), { initialValue: '' });

  readonly selection = signal<ReferenceEditorItem[]>([]);
  readonly entities = signal<ReferenceEditorItem[]>([]);
  readonly loading = signal<boolean>(false);
  readonly creating = signal<boolean>(false);
  readonly newEntityName = signal<string>('');

  constructor() {
    const initial = Array.isArray(this.data?.currentSelection) ? this.data.currentSelection : [];
    this.selection.set(
      initial
        .filter((it) => it && typeof it === 'object' && typeof it.id === 'string' && it.id.length > 0)
        .map((it) => ({
          ...it,
          type: this.targetType,
          displayName: typeof it.displayName === 'string' ? it.displayName : it.id,
        }))
    );

    this.loading.set(true);
    this.loadEntities();
  }

  private loadEntities(): void {
    if (this.targetType === 'BusinessCapability') {
      this.entityApi.listBusinessCapabilities().subscribe({
        next: (list) => this.entities.set(this.mapBusinessCapabilitiesToReferenceItems(list)),
        error: () => {
          this.entities.set([]);
          this.loading.set(false);
        },
        complete: () => this.loading.set(false),
      });
    } else if (this.targetType === 'DataProduct') {
      this.entityApi.listDataProducts().subscribe({
        next: (list) => this.entities.set(this.mapDataProductsToReferenceItems(list)),
        error: () => {
          this.entities.set([]);
          this.loading.set(false);
        },
        complete: () => this.loading.set(false),
      });
    } else if (this.targetType === 'UserGroup') {
      this.entityApi.listUserGroups().subscribe({
        next: (list) => this.entities.set(this.mapUserGroupsToReferenceItems(list)),
        error: () => {
          this.entities.set([]);
          this.loading.set(false);
        },
        complete: () => this.loading.set(false),
      });
    } else if (this.targetType === 'Platform') {
      this.entityApi.listPlatforms().subscribe({
        next: (list) => this.entities.set(this.mapPlatformsToReferenceItems(list)),
        error: () => {
          this.entities.set([]);
          this.loading.set(false);
        },
        complete: () => this.loading.set(false),
      });
    } else {
      this.entityApi.listEntitiesByType(this.targetType).subscribe({
        next: (list) => this.entities.set(this.mapListEntitiesToReferenceItems(list)),
        error: () => {
          this.entities.set([]);
          this.loading.set(false);
        },
        complete: () => this.loading.set(false),
      });
    }
  }

  private mapBusinessCapabilitiesToReferenceItems(list: unknown): ReferenceEditorItem[] {
    let items: { id: string; displayName: string }[] = [];
    if (Array.isArray(list)) {
      items = list;
    } else if (list && typeof list === 'object' && 'businessCapabilities' in list) {
      items = (list as { businessCapabilities?: { id: string; displayName: string }[] }).businessCapabilities ?? [];
    }
    return items
      .map((e) => ({
        id: e.id,
        type: this.targetType,
        displayName: e.displayName,
        fullName: e.displayName,
        description: undefined,
      }))
      .filter((x) => x.id.length > 0);
  }

  private mapUserGroupsToReferenceItems(list: unknown): ReferenceEditorItem[] {
    let items: { id: string; displayName: string }[] = [];
    if (Array.isArray(list)) {
      items = list;
    } else if (list && typeof list === 'object' && 'userGroups' in list) {
      items = (list as { userGroups?: { id: string; displayName: string }[] }).userGroups ?? [];
    }
    return items
      .map((e) => ({
        id: e.id,
        type: this.targetType,
        displayName: e.displayName,
        fullName: e.displayName,
        description: undefined,
      }))
      .filter((x) => x.id.length > 0);
  }

  private mapPlatformsToReferenceItems(list: unknown): ReferenceEditorItem[] {
    let items: { id: string; displayName: string }[] = [];
    if (Array.isArray(list)) {
      items = list;
    } else if (list && typeof list === 'object' && 'platforms' in list) {
      items = (list as { platforms?: { id: string; displayName: string }[] }).platforms ?? [];
    }
    return items
      .map((e) => ({
        id: e.id,
        type: this.targetType,
        displayName: e.displayName,
        fullName: e.displayName,
        description: undefined,
      }))
      .filter((x) => x.id.length > 0);
  }

  private mapDataProductsToReferenceItems(list: unknown): ReferenceEditorItem[] {
    let items: { id: string; displayName: string }[] = [];
    if (Array.isArray(list)) {
      items = list;
    } else if (list && typeof list === 'object' && 'dataProducts' in list) {
      items = (list as { dataProducts?: { id: string; displayName: string }[] }).dataProducts ?? [];
    }
    return items
      .map((e) => ({
        id: e.id,
        type: this.targetType,
        displayName: e.displayName,
        fullName: e.displayName,
        description: undefined,
      }))
      .filter((x) => x.id.length > 0);
  }

  private mapListEntitiesToReferenceItems(list: ListEntities200ResponseInner[]): ReferenceEditorItem[] {
    if (!Array.isArray(list)) return [];
    return list
      .map((e) => {
        const id = typeof e.id === 'string' ? e.id : '';
        const displayName =
          typeof e.displayName === 'string' && e.displayName.trim().length > 0
            ? e.displayName
            : typeof e.id === 'string'
              ? e.id
              : '';
        return {
          id,
          type: this.targetType,
          displayName,
          fullName: displayName,
          description: typeof (e as any).description === 'string' ? (e as any).description : undefined,
        };
      })
      .filter((x) => x.id.length > 0);
  }

  readonly availableToAdd = computed(() => {
    const q = (this.searchValue() ?? '').trim().toLowerCase();
    const selectedIds = new Set(this.selection().map((s) => s.id));

    let list = this.entities().filter((e) => !selectedIds.has(e.id));
    if (q) {
      list = list.filter((e) => e.displayName.toLowerCase().includes(q) || (e.description ?? '').toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
  });

  add(item: ReferenceEditorItem): void {
    this.selection.update((prev) => [...prev, item]);
  }

  remove(id: string): void {
    this.selection.update((prev) => prev.filter((m) => m.id !== id));
  }

  createNewEntity(): void {
    const name = this.newEntityName().trim();
    if (!name || this.creating()) return;

    this.creating.set(true);
    const guid = this.generateGuid();
    const body = {
      id: guid,
      displayName: name,
      type: this.targetType,
      status: 'ACTIVE',
    };

    this.entityApi.putEntity(guid, body, this.targetType).subscribe({
      next: (response: unknown) => {
        const resp = response as Record<string, unknown>;
        const createdId = typeof resp?.['id'] === 'string' ? resp['id'] : guid;
        const newItem: ReferenceEditorItem = {
          id: createdId,
          type: this.targetType,
          displayName: name,
          fullName: name,
          description: undefined,
        };
        this.entities.update((prev) => [...prev, newItem]);
        this.newEntityName.set('');
        this.selection.update((prev) => [...prev, newItem]);
      },
      error: (err) => {
        console.error('Failed to create entity:', err);
        this.creating.set(false);
      },
      complete: () => this.creating.set(false),
    });
  }

  private generateGuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  ok(): void {
    this.dialogRef.close(this.selection());
  }
}

