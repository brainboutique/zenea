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
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { DotDateAdapter, DOT_DATE_FORMATS } from '../../services/dot-date-adapter';
import { TextFieldModule } from '@angular/cdk/text-field';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
import { ApplicationsService, ApplicationItem } from '../../services/ApplicationsService';
import { JaccardService } from '../../services/jaccard.service';
import {
  MigrationTargetItem,
  MIGRATION_TARGET_LIFECYCLE_OPTIONS,
  MIGRATION_TARGET_PRIORITY_OPTIONS,
  MIGRATION_TARGET_EFFORT_OPTIONS,
  MIGRATION_TARGET_BENEFIT_OPTIONS,
  generateMigrationTargetEtaOptions,
} from '../../models/migration-target-item';
import { TranslatePipe } from '@ngx-translate/core';
import { matchesSearch } from '../../utils/search-utils';
import { readRelationItems } from '../../utils/relation-data';

export interface MigrationTargetDialogData {
  currentSelection: MigrationTargetItem[];
  /** ID (GUID) of the current application; used to look up its capabilities for Jaccard similarity ordering. */
  currentAppId?: string;
}

@Component({
  selector: 'app-migration-target-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatMenuModule,
    MatDatepickerModule,
    TextFieldModule,
    TranslatePipe,
  ],
  providers: [
    { provide: DateAdapter, useClass: DotDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: DOT_DATE_FORMATS },
  ],
  templateUrl: './migration-target-dialog.component.html',
  styleUrl: './migration-target-dialog.component.scss',
})
export class MigrationTargetDialogComponent {
  private dialogRef = inject(MatDialogRef<MigrationTargetDialogComponent>);
  private data = inject<MigrationTargetDialogData>(MAT_DIALOG_DATA);
  private applicationsService = inject(ApplicationsService);
  private jaccardService = inject(JaccardService);

  readonly LIFECYCLE_OPTIONS = MIGRATION_TARGET_LIFECYCLE_OPTIONS;
  readonly PRIORITY_OPTIONS = MIGRATION_TARGET_PRIORITY_OPTIONS;
  readonly EFFORT_OPTIONS = MIGRATION_TARGET_EFFORT_OPTIONS;
  readonly BENEFIT_OPTIONS = MIGRATION_TARGET_BENEFIT_OPTIONS;
  readonly ETA_OPTIONS = generateMigrationTargetEtaOptions();

  searchCtrl = new FormControl<string>('', { nonNullable: true });
  private searchValue = toSignal(this.searchCtrl.valueChanges.pipe(startWith('')), { initialValue: '' });

  /** Selected items (order preserved); selected always at top in UI. */
  selection = signal<MigrationTargetItem[]>([]);

  applications = this.applicationsService.applications;
  loading = this.applicationsService.loading;

  /** Applications not yet selected, filtered by search. Sorted by Jaccard similarity descending. */
  availableToAdd = computed(() => {
    const q = (this.searchValue() ?? '').trim();
    const apps = this.applications();
    const selectedIds = new Set(this.selection().map((s) => s.id));
    let list = apps.filter((a) => !selectedIds.has(a.id) && a.id !== this.data?.currentAppId);
    if (q) {
      list = list.filter((a) => matchesSearch(q, a.displayName));
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
    // Lazily load applications only when this dialog is actually used.
    this.applicationsService.ensureLoaded();

    const initial = Array.isArray(this.data?.currentSelection) ? this.data.currentSelection : [];
    this.selection.set(
      initial.map((m) => ({ ...m, proportion: m.proportion != null ? m.proportion : 100 }))
    );
  }

  /** User groups already assigned to the current application (subset picker source). */
  appUserGroups = computed(() => {
    const apps = this.applications();
    const app = apps.find((a) => a.id === this.data?.currentAppId);
    if (!app) return [];
    return readRelationItems(app.relApplicationToUserGroup).map((g) => ({
      id: g.id,
      displayName: g.displayName,
      fullName: g.fullName,
    }));
  });

  /** Toggle a user group on/off for a migration target item. */
  toggleUserGroup(itemId: string, ug: { id: string; displayName: string; fullName?: string }): void {
    this.selection.update((prev) =>
      prev.map((m) => {
        if (m.id !== itemId) return m;
        const current = m.userGroup ?? [];
        const exists = current.some((g) => g.id === ug.id);
        const updated = exists
          ? current.filter((g) => g.id !== ug.id)
          : [...current, ug];
        return { ...m, userGroup: updated.length > 0 ? updated : null };
      })
    );
  }

  /** Check if a user group is selected for a migration target item. */
  isUserGroupSelected(itemId: string, ugId: string): boolean {
    const item = this.selection().find((m) => m.id === itemId);
    return item?.userGroup?.some((g) => g.id === ugId) ?? false;
  }

  add(app: ApplicationItem): void {
    const item: MigrationTargetItem = {
      id: app.id,
      type: 'Application',
      displayName: app.displayName,
      // Default lifecycle for newly added migration target edges.
      lifecycle: 'Idea',
      proportion: 100,
    };
    this.selection.update((prev) => [...prev, item]);
  }

  remove(id: string): void {
    this.selection.update((prev) => prev.filter((m) => m.id !== id));
  }

  updateMeta(id: string, meta: Partial<Pick<MigrationTargetItem, 'lifecycle' | 'proportion' | 'priority' | 'effort' | 'benefit' | 'eta' | 'comments' | 'startDate' | 'endDate' | 'projectReference' | 'userGroup'>>): void {
    this.selection.update((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...meta } : m))
    );
  }

  onProportionInput(id: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input?.value;
    const num = raw !== '' && raw != null ? Number(raw) : null;
    const newValue = num != null && !Number.isNaN(num) ? Math.min(100, Math.max(0, Math.round(num))) : 100;

    const prev = this.selection();
    const othersSum = prev
      .filter((m) => m.id !== id)
      .reduce((s, m) => s + (m.proportion ?? 100), 0);

    if (othersSum > 0) {
      const scale = (100 - newValue) / othersSum;
      this.selection.set(
        prev.map((m) => {
          if (m.id === id) return { ...m, proportion: newValue };
          return { ...m, proportion: Math.round((m.proportion ?? 100) * scale) };
        })
      );
    } else {
      this.updateMeta(id, { proportion: newValue });
    }
  }

  /** True if the application has TIME classification "invest" (for dark green styling). */
  isInvestApp(id: string): boolean {
    const app = this.applications().find((a) => a.id === id);
    return (app?.lxTimeClassification ?? '').toString().toLowerCase() === 'invest';
  }

  /** Parse an ISO date string to a Date object for the datepicker. */
  parseDate(iso: string | null | undefined): Date | null {
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  /** Handle start date change from date picker. */
  onStartDateChange(itemId: string, value: Date | null): void {
    this.updateMeta(itemId, { startDate: value ? this.toIsoDate(value) : null });
  }

  /** Handle end date change from date picker. */
  onEndDateChange(itemId: string, value: Date | null): void {
    this.updateMeta(itemId, { endDate: value ? this.toIsoDate(value) : null });
  }

  /** Called when any date picker closes. */
  onPickerClosed(): void {
    // No-op; kept for template binding.
  }

  /** Convert a Date to ISO date string (YYYY-MM-DD). */
  private toIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  close(): void {
    this.dialogRef.close(this.selection());
  }
}
