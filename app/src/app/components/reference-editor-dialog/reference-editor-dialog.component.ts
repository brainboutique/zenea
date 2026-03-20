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
    this.entityApi.listEntitiesByType(this.targetType).subscribe({
      next: (list) => this.entities.set(this.mapListEntitiesToReferenceItems(list)),
      error: () => {
        this.entities.set([]);
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
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

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  ok(): void {
    this.dialogRef.close(this.selection());
  }
}

