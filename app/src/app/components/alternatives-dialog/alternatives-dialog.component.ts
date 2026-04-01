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
 * You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <https://www.gnu.org/>.
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
import { ApplicationsService, ApplicationItem } from '../../services/ApplicationsService';
import { JaccardService } from '../../services/jaccard.service';
import { AlternativeItem } from '../../models/alternative-item';
import { TranslateModule } from '@ngx-translate/core';

export interface AlternativesDialogData {
  currentSelection: AlternativeItem[];
  /** ID (GUID) of the current application; used for Jaccard similarity ordering. */
  currentAppId?: string;
}

@Component({
  selector: 'app-alternatives-dialog',
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
  templateUrl: './alternatives-dialog.component.html',
  styleUrl: './alternatives-dialog.component.scss',
})
export class AlternativesDialogComponent {
  private dialogRef = inject(MatDialogRef<AlternativesDialogComponent>);
  private data = inject<AlternativesDialogData>(MAT_DIALOG_DATA);
  private applicationsService = inject(ApplicationsService);
  private jaccardService = inject(JaccardService);

  searchCtrl = new FormControl<string>('', { nonNullable: true });
  private searchValue = toSignal(this.searchCtrl.valueChanges.pipe(startWith('')), { initialValue: '' });

  selection = signal<AlternativeItem[]>([]);

  applications = this.applicationsService.applications;
  loading = this.applicationsService.loading;

  availableToAdd = computed(() => {
    const q = (this.searchValue() ?? '').trim().toLowerCase();
    const apps = this.applications();
    const selectedIds = new Set(this.selection().map((s) => s.id));
    let list = apps.filter((a) => !selectedIds.has(a.id) && a.id !== this.data?.currentAppId);
    if (q) {
      list = list.filter((a) => a.displayName.toLowerCase().includes(q));
    }
    const currentApp = apps.find((a) => a.id === this.data?.currentAppId);
    const ref = new Set<string>(currentApp?.capabilityNames ?? []);
    return list
      .map((a) => ({
        app: a,
        similarity: this.jaccardService.similarity(ref, new Set(a.capabilityNames ?? [])),
      }))
      .sort((a, b) => b.similarity - a.similarity || a.app.displayName.localeCompare(b.app.displayName))
      .map(({ app, similarity }) => ({ ...app, similarity }));
  });

  constructor() {
    this.applicationsService.ensureLoaded();

    const initial = Array.isArray(this.data?.currentSelection) ? this.data.currentSelection : [];
    this.selection.set(
      initial.map((m) => ({
        ...m,
        functionalOverlap: m.functionalOverlap != null ? m.functionalOverlap : 100,
      }))
    );
  }

  add(app: ApplicationItem): void {
    const item: AlternativeItem = {
      id: app.id,
      type: 'Application',
      displayName: app.displayName,
      functionalOverlap: 100,
      comment: '',
    };
    this.selection.update((prev) => [...prev, item]);
  }

  remove(id: string): void {
    this.selection.update((prev) => prev.filter((m) => m.id !== id));
  }

  updateMeta(id: string, meta: Partial<Pick<AlternativeItem, 'functionalOverlap' | 'comment'>>): void {
    this.selection.update((prev) => prev.map((m) => (m.id === id ? { ...m, ...meta } : m)));
  }

  onFunctionalOverlapInput(id: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input?.value;
    const num = raw !== '' && raw != null ? Number(raw) : null;
    const newValue = num != null && !Number.isNaN(num) ? Math.min(100, Math.max(0, Math.round(num))) : 100;
    this.updateMeta(id, { functionalOverlap: newValue });
  }

  /** True if the application has TIME classification "invest" (for dark green styling). */
  isInvestApp(id: string): boolean {
    const app = this.applications().find((a) => a.id === id);
    return (app?.lxTimeClassification ?? '').toString().toLowerCase() === 'invest';
  }

  close(): void {
    this.dialogRef.close(this.selection());
  }
}
