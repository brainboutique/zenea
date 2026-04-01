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

import { Component, signal, ViewChild, AfterViewInit, inject, OnInit, input, OnDestroy, DestroyRef } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { EntityApiService } from '../../services/entity-api.service';
import { ListEntities200ResponseInner } from '../../services/api/model/listEntities200ResponseInner';
import { ListEntities200ResponseInnerRelApplicationToUserGroupInner } from '../../services/api/model/listEntities200ResponseInnerRelApplicationToUserGroupInner';
import { EntityListFilters, emptyEntityListFilters } from '../../models/entity-list-filters';
import { EntityListRefreshService } from '../../services/entity-list-refresh.service';
import { FacetsService } from '../../services/FacetsService';
import { PillsComponent } from '../../components/pills/pills.component';
import { PillItem } from '../../components/pills/pill-item';
import { UserGroupPillComponent } from '../../components/user-group-pill/user-group-pill.component';
import { MigrationTargetPillComponent } from '../../components/migration-target-pill/migration-target-pill.component';
import { AlternativesPillComponent } from '../../components/alternatives-pill/alternatives-pill.component';
import { SuitabilityRatingComponent } from '../../components/suitability-rating/suitability-rating.component';
import { TimeClassificationComponent } from '../../components/time-classification/time-classification.component';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { TableVirtualScrollModule, TableVirtualScrollDataSource } from 'ng-table-virtual-scroll';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { take } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { ListFiltersComponent, SUITABILITY_FILTER_EMPTY } from '../../components/list-filters/list-filters.component';
import { TranslateModule } from '@ngx-translate/core';
import { PageTitleService } from '../../services/page-title.service';
import { SUITABILITY_VALUES } from '../../components/suitability-rating/suitability-rating.component';
import { TIME_CLASSIFICATION_VALUES } from '../../components/time-classification/time-classification.component';
import { CRITICALITY_VALUES } from '../../components/suitability-rating/suitability-rating.component';
import { PLATFORM_TEMP_VALUES } from '../../models/platform-temp-values';
import { ApplicationsService } from '../../services/ApplicationsService';
import { UserConfigService } from '../../services/user-config.service';
import { AuthorizationService } from '../../services/authorization.service';
import { MigrationTargetDialogComponent } from '../../components/migration-target-dialog/migration-target-dialog.component';
import { MigrationTargetItem } from '../../models/migration-target-item';
import { AlternativesDialogComponent } from '../../components/alternatives-dialog/alternatives-dialog.component';
import { AlternativeItem } from '../../models/alternative-item';
import { ReferenceEditorDialogComponent } from '../../components/reference-editor-dialog/reference-editor-dialog.component';
import { GitHistoryDialogComponent } from '../../components/git-history-dialog/git-history-dialog.component';
import type { ReferenceEditorItem, ReferenceTargetType, ReferenceEditorDialogData } from '../../models/reference-editor-item';
import type ExcelJS from 'exceljs';

/** LocalStorage key for list column visibility */
const LIST_COLUMN_VISIBILITY_KEY = 'zenea.list.columnVisibility';

/** Column visibility shape: { [columnId]: { visibility: boolean } } */
export type ColumnVisibility = Record<string, { visibility: boolean }>;

/** Columns that are always visible and never toggleable. */
const ALWAYS_VISIBLE_COLUMNS = ['lifecycle', 'displayName', 'actions'] as const;

/** Columns that can be toggled in the column selector (order preserved). */
const TOGGLEABLE_COLUMNS: { id: string; label: string }[] = [
  { id: 'earmarkingsTEMP', label: 'Earmarkings' },
  { id: 'platformTEMP', label: 'Platform' },
  { id: 'lxTimeClassification', label: 'TIME' },
  { id: 'migrationTarget', label: 'Migration target' },
  { id: 'alternatives', label: 'Alternatives' },
  { id: 'functionalSuitability', label: 'Functional' },
  { id: 'technicalSuitability', label: 'Technical' },
  { id: 'businessCriticality', label: 'Business criticality' },
  { id: 'relApplicationToBusinessCapability', label: 'Business Capability' },
  { id: 'relApplicationToUserGroup', label: 'User Group' },
  { id: 'relApplicationToDataProduct', label: 'Data Products' },
];

function defaultColumnVisibility(): ColumnVisibility {
  const v: ColumnVisibility = {};
  TOGGLEABLE_COLUMNS.forEach((c) => (v[c.id] = { visibility: true }));
  return v;
}

function loadColumnVisibility(): ColumnVisibility {
  try {
    const raw = localStorage.getItem(LIST_COLUMN_VISIBILITY_KEY);
    if (!raw) return defaultColumnVisibility();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result = defaultColumnVisibility();
    TOGGLEABLE_COLUMNS.forEach((c) => {
      const entry = parsed[c.id];
      if (entry && typeof entry === 'object' && 'visibility' in entry && typeof (entry as { visibility: unknown }).visibility === 'boolean') {
        result[c.id] = { visibility: (entry as { visibility: boolean }).visibility };
      }
    });
    return result;
  } catch {
    return defaultColumnVisibility();
  }
}

function saveColumnVisibility(visibility: ColumnVisibility): void {
  try {
    localStorage.setItem(LIST_COLUMN_VISIBILITY_KEY, JSON.stringify(visibility));
  } catch {
    // ignore
  }
}

/** Query param keys for filter persistence in URL */
const QP = {
  name: 'name',
  techSuit: 'techSuit',
  bizSuit: 'bizSuit',
  timeClass: 'timeClass',
  bizCrit: 'bizCrit',
  bizCap: 'bizCap',
  userGroup: 'userGroup',
  project: 'project',
  platformTEMP: 'platformTEMP',
  dataProduct: 'dataProduct',
} as const;

@Component({
  selector: 'app-application-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    MatTableModule,
    MatSortModule,
    TableVirtualScrollModule,
    ScrollingModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    PillsComponent,
    UserGroupPillComponent,
    MigrationTargetPillComponent,
    AlternativesPillComponent,
    SuitabilityRatingComponent,
    TimeClassificationComponent,
    ListFiltersComponent,
    MatMenuModule,
    MatCheckboxModule,
    TranslateModule,
  ],
  templateUrl: './list.component.html',
  styleUrl: './list.component.scss',
})
export class ApplicationListComponent implements AfterViewInit, OnInit, OnDestroy {
  @ViewChild(MatSort) sort!: MatSort;

  /** When 'compact', suitability ratings show only stars (no label, read-only). */
  mode = input<'compact' | 'default'>('default');

  private entityService = inject(EntityApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private pageTitleService = inject(PageTitleService);
  private refreshService = inject(EntityListRefreshService);
  private facetsService = inject(FacetsService);
  applicationsService = inject(ApplicationsService);
  private destroyRef = inject(DestroyRef);
  private userConfig = inject(UserConfigService);
  private authorization = inject(AuthorizationService);

  readonly canEdit = this.authorization.canEdit;
  private dialog = inject(MatDialog);

  /** When true, blur application name, migration target and user group in list (Settings). */
  hideSensitive = this.userConfig.hideSensitiveInformation$;
  private readonly PATCH_DEBOUNCE_MS = 400;
  private pendingPatches = new Map<string, Record<string, unknown>>();
  private patchTimers = new Map<string, any>();

  /** Last filters used for loadEntities (so we can reload on Git refresh). */
  private lastLoadFilters = signal<EntityListFilters | null>(null);

  /** Initial filter values from URL, passed to app-list-filters once. */
  initialFilters = signal<Partial<EntityListFilters>>({});

  entities = signal<ListEntities200ResponseInner[]>([]);
  /** All entities from last API load (no name filter); client-side name filter applied to dataSource. */
  private allEntities = signal<ListEntities200ResponseInner[]>([]);
  /** Current name filter from filters (client-side only). */
  private nameFilter = signal('');
  /** Current TIME classification filter (client-side only). */
  private timeClassificationFilter = signal('');
  /** Current business criticality filter (client-side only). */
  private businessCriticalityFilter = signal('');
  /** Last filters sent to API (excluding name) to avoid refetch when only name changes. */
  private lastServerFilters = signal<string>('');
  loading = signal(false);
  error = signal<string | null>(null);

  /** Number of items currently displayed (after client-side name filter). Used for empty-state message. */
  displayedCount = signal(0);

  dataSource = new TableVirtualScrollDataSource<ListEntities200ResponseInner>([]);

  /** Visibility state: { [columnId]: { visibility: boolean } }. Loaded from localStorage on init. */
  columnVisibility = signal<ColumnVisibility>(defaultColumnVisibility());

  /** Column meta for the selector menu (id + label). */
  readonly columnMeta = signal<{ id: string; label: string }[]>(TOGGLEABLE_COLUMNS);

  /** Toggle visibility for a column and persist to localStorage. */
  toggleColumnVisibility(columnId: string): void {
    const next = { ...this.columnVisibility() };
    const entry = next[columnId];
    next[columnId] = { visibility: entry ? !entry.visibility : false };
    this.columnVisibility.set(next);
    saveColumnVisibility(next);
  }

  /** Displayed column ids (computed from columnVisibility; actions always present). */
  get displayedColumns(): string[] {
    const vis = this.columnVisibility();
    const visibleToggleable = TOGGLEABLE_COLUMNS.filter((c) => vis[c.id]?.visibility !== false).map((c) => c.id);
    return ['lifecycle', 'displayName', ...visibleToggleable, 'actions'];
  }

  /** Whether migration target editing is visually enabled for this row (TIME === 'migrate'). */
  isMigrationMigrate(row: ListEntities200ResponseInner): boolean {
    return (row.lxTimeClassification ?? '').toString().toLowerCase() === 'migrate';
  }

  /** Application lifecycle helpers (read from generic JSON: ApplicationLifecycle.asString). */
  private getApplicationLifecycleAsString(row: ListEntities200ResponseInner): string {
    const lifecycle = (row as unknown as { ApplicationLifecycle?: { asString?: string } }).ApplicationLifecycle;
    const value = lifecycle?.asString ?? '';
    return typeof value === 'string' ? value : '';
  }

  getLifecycleIconName(row: ListEntities200ResponseInner): string {
    const value = this.getApplicationLifecycleAsString(row);
    switch (value) {
      case 'phaseIn':
        return 'login';
      case 'active':
        return 'run_circle';
      case 'phaseOut':
        return 'logout';
      case 'endOfLife':
        return 'do_disturb_alt';
      default:
        return '';
    }
  }

  getLifecycleIconClass(row: ListEntities200ResponseInner): string {
    const value = this.getApplicationLifecycleAsString(row);
    switch (value) {
      case 'phaseIn':
        return 'lifecycle-icon-phase-in';
      case 'active':
        return 'lifecycle-icon-active';
      case 'phaseOut':
        return 'lifecycle-icon-phase-out';
      case 'endOfLife':
        return 'lifecycle-icon-end-of-life';
      default:
        return '';
    }
  }

  /**
   * Application name tooltip text.
   *
   * Uses the application `description` field (from the Application JSON).
   */
  getApplicationNameTitle(row: ListEntities200ResponseInner): string | null {
    const desc = row.description;
    const trimmed = typeof desc === 'string' ? desc.trim() : '';
    return trimmed || null;
  }

  readonly platformTempOptions = signal<string[]>([...PLATFORM_TEMP_VALUES]);

  /** Row id whose Platform select is open; options are rendered only for this row. */
  platformSelectOpenRowId = signal<string | null>(null);

  /** Platform options to render: full list when this row's select is open, else only current value for trigger display. */
  getPlatformOptionsForRow(row: ListEntities200ResponseInner): string[] {
    const openId = this.platformSelectOpenRowId();
    if (openId === row.id) {
      return this.platformTempOptions();
    }
    const current = row.platformTEMP ?? '';
    return current ? ['', current] : [''];
  }

  onPlatformSelectOpenedChange(row: ListEntities200ResponseInner, opened: boolean): void {
    this.platformSelectOpenRowId.set(opened ? (row.id ?? null) : null);
  }

  /** Convert list API relation items to pill items (generic pills). */
  toPillItems(items: ListEntities200ResponseInnerRelApplicationToUserGroupInner[] | undefined): PillItem[] {
    if (!Array.isArray(items)) return [];
    return items.map((it) => {
      const displayName = it.displayName ?? it.fullName ?? it.id ?? '—';
      const description = it.description?.trim() ?? '';
      const title = description ? `${displayName}\n${description}` : displayName;
      return {
        label: displayName,
        title,
      };
    });
  }

  /** Stable track id for user group items in @for (avoids track expression SSR issues). */
  userGroupTrack(_index: number, item: ListEntities200ResponseInnerRelApplicationToUserGroupInner): string {
    return item.id ?? item.displayName ?? item.fullName ?? `i${_index}`;
  }

  /** Callback for TIME classification change: PATCH entity with only lxTimeClassification. */
  getOnTimeMutated(row: ListEntities200ResponseInner): () => void {
    return () => this.patchEntityField(row.id!, { lxTimeClassification: row.lxTimeClassification ?? null });
  }

  /** Callback for functional suitability change: PATCH entity with only functionalSuitability. */
  getOnFunctionalMutated(row: ListEntities200ResponseInner): () => void {
    return () => this.patchEntityField(row.id!, { functionalSuitability: row.functionalSuitability ?? null });
  }

  /** Callback for technical suitability change: PATCH entity with only technicalSuitability. */
  getOnTechnicalMutated(row: ListEntities200ResponseInner): () => void {
    return () => this.patchEntityField(row.id!, { technicalSuitability: row.technicalSuitability ?? null });
  }

  /** Callback for business criticality change: PATCH entity with only businessCriticality. */
  getOnBusinessCriticalityMutated(row: ListEntities200ResponseInner): () => void {
    return () => this.patchEntityField(row.id!, { businessCriticality: row.businessCriticality ?? null });
  }

  onPlatformTempChange(row: ListEntities200ResponseInner, value: string | null): void {
    if (!row.id) return;
    row.platformTEMP = value ?? null;
    this.patchEntityField(row.id, { platformTEMP: row.platformTEMP ?? null });
  }

  onEarmarkingsTempChange(row: ListEntities200ResponseInner, value: string): void {
    if (!row.id) return;
    const trimmed = (value ?? '').trim() || null;
    row.earmarkingsTEMP = trimmed ?? undefined;
    this.patchEntityField(row.id, { earmarkingsTEMP: trimmed });
  }

  /** Label for the migration target trigger: "<App Name> [P1, XL, Q2/26]" per target; proportion shown only when not 100%. */
  getMigrationTargetTriggerLabel(row: ListEntities200ResponseInner): string {
    const arr = row.migrationTarget;
    if (!Array.isArray(arr) || arr.length === 0) return 'Select…';
    return arr
      .map((m) => {
        const name = m && typeof m === 'object' && 'displayName' in m ? m.displayName : (m as { id?: string })?.id ?? '';
        const parts: string[] = [];
        if (m && typeof m === 'object' && 'lifecycle' in m && m.lifecycle) parts.push(String(m.lifecycle));
        if (m && typeof m === 'object' && 'proportion' in m && m.proportion != null && m.proportion !== 100) parts.push(`${m.proportion}%`);
        if (m && typeof m === 'object' && 'priority' in m && m.priority != null) parts.push(`P${m.priority}`);
        if (m && typeof m === 'object' && 'effort' in m && m.effort) parts.push(String(m.effort));
        if (m && typeof m === 'object' && 'eta' in m && m.eta) parts.push(String(m.eta));
        const bracket = parts.length ? ` [${parts.join(', ')}]` : '';
        return `${name}${bracket}`;
      })
      .filter(Boolean)
      .join(', ') || 'Select…';
  }

  /** Migration target items normalized for pill display. */
  getMigrationTargetPills(row: ListEntities200ResponseInner): MigrationTargetItem[] {
    const arr = row.migrationTarget;
    if (!Array.isArray(arr) || arr.length === 0) return [];

    const result: MigrationTargetItem[] = [];
    for (const m of arr) {
      const raw: any = m;
      const id = raw?.id ?? '';
      if (!id) continue;

      const idStr = String(id);
      const displayName = raw?.displayName != null && String(raw.displayName).trim() !== '' ? String(raw.displayName) : idStr;

      const lifecycleRaw = raw?.lifecycle;
      const lifecycle = lifecycleRaw != null && String(lifecycleRaw).trim() !== '' ? String(lifecycleRaw) : undefined;

      const proportionRaw = raw?.proportion;
      const proportion = typeof proportionRaw === 'number' && !Number.isNaN(proportionRaw) ? proportionRaw : 100;

      const priorityRaw = raw?.priority;
      const priority = typeof priorityRaw === 'number' && !Number.isNaN(priorityRaw) ? priorityRaw : undefined;

      const effortRaw = raw?.effort;
      const effort = effortRaw != null && String(effortRaw).trim() !== '' ? String(effortRaw) : undefined;

      const etaRaw = raw?.eta;
      const eta = etaRaw != null && String(etaRaw).trim() !== '' ? String(etaRaw) : undefined;

      result.push({
        id: idStr,
        type: raw?.type ?? 'Application',
        displayName,
        lifecycle,
        proportion,
        priority,
        effort,
        eta,
      } satisfies MigrationTargetItem);
    }

    return result;
  }

  /** Open migration target dialog for this row; on close updates row and PATCHes. */
  openMigrationTargetDialog(row: ListEntities200ResponseInner): void {
    if (!row.id) return;
    const current: MigrationTargetItem[] = Array.isArray(row.migrationTarget)
      ? row.migrationTarget.map((m) => ({
          id: m.id,
          type: m.type ?? 'Application',
          displayName: m.displayName,
          lifecycle: m.lifecycle ?? undefined,
          proportion: m.proportion != null ? m.proportion : 100,
          priority: m.priority ?? undefined,
          effort: m.effort ?? undefined,
          eta: m.eta ?? undefined,
        }))
      : [];
    const ref = this.dialog.open(MigrationTargetDialogComponent, {
      width: '80vw',
      maxWidth: '80vw',
      height: '80vh',
      maxHeight: '80vh',
      panelClass: 'migration-target-dialog-panel',
      data: { currentSelection: current, currentAppId: row.id } satisfies { currentSelection: MigrationTargetItem[]; currentAppId: string },
    });
    ref.afterClosed().subscribe((result: MigrationTargetItem[] | undefined) => {
      if (result == null) return;
      row.migrationTarget = result.length === 0 ? undefined : result.map((m) => ({ ...m }));
      this.patchEntityField(row.id!, {
        migrationTarget: result.length === 0 ? null : this.migrationTargetToEdges(row),
      });
    });
  }

  /** Build edges payload for migrationTarget (node + optional lifecycle, proportion, priority, effort, eta per edge). */
  /** Open alternatives dialog for this row; on close updates row and PATCHes. */
  openAlternativesDialog(row: ListEntities200ResponseInner): void {
    if (!row.id) return;
    const current: AlternativeItem[] = Array.isArray(row.alternatives)
      ? row.alternatives.map((m) => ({
          id: m.id,
          type: m.type ?? 'Application',
          displayName: m.displayName,
          functionalOverlap: m.functionalOverlap != null ? m.functionalOverlap : 100,
          comment: m.comment ?? '',
        }))
      : [];
    const ref = this.dialog.open(AlternativesDialogComponent, {
      width: '80vw',
      maxWidth: '80vw',
      height: '80vh',
      maxHeight: '80vh',
      panelClass: 'migration-target-dialog-panel',
      data: { currentSelection: current, currentAppId: row.id } satisfies { currentSelection: AlternativeItem[]; currentAppId: string },
    });
    ref.afterClosed().subscribe((result: AlternativeItem[] | undefined) => {
      if (result == null) return;
      row.alternatives = result.length === 0 ? undefined : result.map((m) => ({ ...m }));
      this.patchEntityField(row.id!, {
        alternatives: result.length === 0 ? null : this.alternativesToEdges(row),
      });
    });
  }

  /** Build edges payload for alternatives (node + functionalOverlap, comment per edge). */
  private alternativesToEdges(row: ListEntities200ResponseInner): {
    edges: Array<{
      node: { factSheet: { id: string; type: string; displayName: string } };
      functionalOverlap: number;
      comment?: string | null;
    }>;
  } {
    const arr = row.alternatives;
    if (!Array.isArray(arr) || arr.length === 0) return { edges: [] };
    return {
      edges: arr.map((m) => {
        const id = m?.id ?? '';
        const displayName = m && typeof m === 'object' && 'displayName' in m ? m.displayName : id;
        const rawFo = m && typeof m === 'object' ? m.functionalOverlap : null;
        const fo =
          rawFo != null && !Number.isNaN(Number(rawFo)) ? Math.min(100, Math.max(0, Math.round(Number(rawFo)))) : 100;
        const edge: {
          node: { factSheet: { id: string; type: string; displayName: string } };
          functionalOverlap: number;
          comment?: string | null;
        } = {
          node: { factSheet: { id, type: 'Application', displayName } },
          functionalOverlap: fo,
        };
        if (m && typeof m === 'object' && m.comment != null && String(m.comment).trim() !== '') {
          edge.comment = String(m.comment).trim();
        }
        return edge;
      }),
    };
  }

  getAlternativesTriggerLabel(row: ListEntities200ResponseInner): string {
    const arr = row.alternatives;
    if (!Array.isArray(arr) || arr.length === 0) return 'Select…';
    return arr
      .map((m) => {
        const name = m && typeof m === 'object' && 'displayName' in m ? m.displayName : (m as { id?: string })?.id ?? '';
        const parts: string[] = [];
        if (m && typeof m === 'object' && 'functionalOverlap' in m && m.functionalOverlap != null && m.functionalOverlap !== 100) {
          parts.push(`${m.functionalOverlap}%`);
        }
        if (m && typeof m === 'object' && m.comment != null && String(m.comment).trim() !== '') {
          const c = String(m.comment).trim();
          parts.push(c.length > 10 ? `${c.slice(0, 10)}...` : c);
        }
        const bracket = parts.length ? ` [${parts.join(', ')}]` : '';
        return `${name}${bracket}`;
      })
      .filter(Boolean)
      .join(', ') || 'Select…';
  }

  getAlternativesPills(row: ListEntities200ResponseInner): AlternativeItem[] {
    const arr = row.alternatives;
    if (!Array.isArray(arr) || arr.length === 0) return [];
    const result: AlternativeItem[] = [];
    for (const m of arr) {
      const raw: Record<string, unknown> = m as unknown as Record<string, unknown>;
      const id = raw?.['id'] ?? '';
      if (!id) continue;
      const idStr = String(id);
      const displayName = raw?.['displayName'] != null && String(raw['displayName']).trim() !== '' ? String(raw['displayName']) : idStr;
      const foRaw = raw?.['functionalOverlap'];
      const functionalOverlap =
        typeof foRaw === 'number' && !Number.isNaN(foRaw) ? Math.min(100, Math.max(0, Math.round(foRaw))) : 100;
      const commentRaw = raw?.['comment'];
      const comment = commentRaw != null && String(commentRaw).trim() !== '' ? String(commentRaw) : '';
      result.push({
        id: idStr,
        type: (raw?.['type'] as string) ?? 'Application',
        displayName,
        functionalOverlap,
        comment,
      } satisfies AlternativeItem);
    }
    return result;
  }

  private migrationTargetToEdges(row: ListEntities200ResponseInner): {
    edges: Array<{
      node: { factSheet: { id: string; type: string; displayName: string } };
      lifecycle?: string | null;
      proportion?: number | null;
      priority?: number | null;
      effort?: string | null;
      eta?: string | null;
    }>;
  } {
    const arr = row.migrationTarget;
    if (!Array.isArray(arr) || arr.length === 0) return { edges: [] };
    return {
      edges: arr.map((m) => {
        const id = m?.id ?? '';
        const displayName = m && typeof m === 'object' && 'displayName' in m ? m.displayName : id;
        const edge: {
          node: { factSheet: { id: string; type: string; displayName: string } };
          lifecycle?: string | null;
          proportion?: number | null;
          priority?: number | null;
          effort?: string | null;
          eta?: string | null;
        } = {
          node: { factSheet: { id, type: 'Application', displayName } },
        };
        if (m && typeof m === 'object') {
          if (m.lifecycle != null && m.lifecycle !== '') edge.lifecycle = m.lifecycle;
          if (m.proportion != null) edge.proportion = m.proportion;
          if (m.priority != null) edge.priority = m.priority;
          if (m.effort != null && m.effort !== '') edge.effort = m.effort;
          if (m.eta != null && m.eta !== '') edge.eta = m.eta;
        }
        return edge;
      }),
    };
  }

  /** PATCH entity with a partial payload (only changed fields). */
  private patchEntityField(guid: string, payload: Record<string, unknown>): void {
    if (!guid) return;

    const existing = this.pendingPatches.get(guid) ?? {};
    this.pendingPatches.set(guid, { ...existing, ...payload });

    const existingTimer = this.patchTimers.get(guid);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      const toSend = this.pendingPatches.get(guid);
      this.pendingPatches.delete(guid);
      this.patchTimers.delete(guid);
      if (!toSend) return;

      // TIME classification + application name affect migration target dialog option rendering/order.
      // (In this list component we only patch TIME classification, not displayName.)
      const shouldInvalidateMigrationTargetOptions =
        Object.prototype.hasOwnProperty.call(toSend, 'lxTimeClassification') ||
        Object.prototype.hasOwnProperty.call(toSend, 'displayName') ||
        Object.prototype.hasOwnProperty.call(toSend, 'relApplicationToBusinessCapability');

      this.entityService.patchEntity(guid, toSend, 'Application').subscribe({
        next: () => {
          if (shouldInvalidateMigrationTargetOptions) this.applicationsService.invalidateMigrationTargetOptionsCache();
        },
        error: (err) => {
          this.error.set(err?.message ?? 'Failed to update entity.');
        },
      });
    }, this.PATCH_DEBOUNCE_MS);

    this.patchTimers.set(guid, timer);
  }

  private relationFacetToReferenceItems(
    items: ListEntities200ResponseInnerRelApplicationToUserGroupInner[] | undefined,
    targetType: ReferenceTargetType
  ): ReferenceEditorItem[] {
    if (!Array.isArray(items)) return [];
    return items
      .map((it) => {
        const id = it.id ?? '';
        if (!id) return null;
        const displayName = it.displayName ?? it.fullName ?? id;
        return {
          id,
          type: targetType,
          displayName,
          fullName: it.fullName ?? undefined,
          description: typeof it.description === 'string' ? it.description : undefined,
        } satisfies ReferenceEditorItem;
      })
      .filter((x): x is ReferenceEditorItem => x != null);
  }

  private referenceItemsToEdges(items: ReferenceEditorItem[]): { edges: Array<{ node: { factSheet: Record<string, unknown> } }> } {
    return {
      edges: items.map((item) => {
        const factSheet: Record<string, unknown> = {
          id: item.id,
          type: item.type,
          displayName: item.displayName,
        };
        if (item.fullName != null && String(item.fullName).trim() !== '') factSheet['fullName'] = item.fullName;
        if (item.description != null && String(item.description).trim() !== '') factSheet['description'] = item.description;
        return { node: { factSheet } };
      }),
    };
  }

  openReferenceEditorForRelation(
    row: ListEntities200ResponseInner,
    relationKey: 'relApplicationToBusinessCapability' | 'relApplicationToUserGroup' | 'relApplicationToDataProduct',
    targetType: ReferenceTargetType
  ): void {
    if (!row.id) return;

    let current: ReferenceEditorItem[] = [];
    if (relationKey === 'relApplicationToBusinessCapability') {
      current = this.relationFacetToReferenceItems(row.relApplicationToBusinessCapability ?? [], targetType);
    } else if (relationKey === 'relApplicationToUserGroup') {
      current = this.relationFacetToReferenceItems(row.relApplicationToUserGroup ?? [], targetType);
    } else if (relationKey === 'relApplicationToDataProduct') {
      current = this.relationFacetToReferenceItems(row.relApplicationToDataProduct ?? [], targetType);
    }

    const ref = this.dialog.open(ReferenceEditorDialogComponent, {
      width: '80vw',
      maxWidth: '80vw',
      height: '80vh',
      maxHeight: '80vh',
      panelClass: 'migration-target-dialog-panel',
      data: { targetType, currentSelection: current.map((m) => ({ ...m })) } satisfies ReferenceEditorDialogData,
    });

    ref.afterClosed().subscribe((result: ReferenceEditorItem[] | undefined) => {
      if (result == null) return;

      const edges = this.referenceItemsToEdges(result);

      const facetItems = result.map((it) => ({
        id: it.id,
        displayName: it.displayName,
        fullName: it.fullName ?? it.displayName,
        type: it.type,
        category: undefined,
        description: it.description ?? undefined,
      }));

      if (relationKey === 'relApplicationToBusinessCapability') {
        row.relApplicationToBusinessCapability = facetItems;
      } else if (relationKey === 'relApplicationToUserGroup') {
        row.relApplicationToUserGroup = facetItems;
      } else if (relationKey === 'relApplicationToDataProduct') {
        row.relApplicationToDataProduct = facetItems;
      }

      this.patchEntityField(row.id!, {
        [relationKey]: edges,
      });
    });
  }

  ngOnInit(): void {
    this.pageTitleService.setTitle('Applications');
    this.columnVisibility.set(loadColumnVisibility());
    this.refreshService.onRefresh.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event === 'show-loading') {
        this.showLoadingState();
      } else {
        this.facetsService.load();
        const f = this.lastLoadFilters();
        if (f) {
          this.loadEntities(f);
        } else {
          const merged = { ...emptyEntityListFilters(), ...this.initialFilters() };
          this.loadEntities(merged);
        }
      }
    });
    this.route.queryParams.pipe(take(1)).subscribe((qp) => {
      const partial: Partial<EntityListFilters> = {};
      const name = (qp[QP.name] ?? '').trim();
      if (name) partial.name = name;
      const tech = (qp[QP.techSuit] ?? '').trim();
      if (tech && (SUITABILITY_VALUES.includes(tech as (typeof SUITABILITY_VALUES)[number]) || tech === SUITABILITY_FILTER_EMPTY)) {
        partial.technicalSuitability = tech;
      }
      const biz = (qp[QP.bizSuit] ?? '').trim();
      if (biz && (SUITABILITY_VALUES.includes(biz as (typeof SUITABILITY_VALUES)[number]) || biz === SUITABILITY_FILTER_EMPTY)) {
        partial.functionalSuitability = biz;
      }
      const timeClass = (qp[QP.timeClass] ?? '').trim();
      if (timeClass && (TIME_CLASSIFICATION_VALUES.includes(timeClass as (typeof TIME_CLASSIFICATION_VALUES)[number]) || timeClass === SUITABILITY_FILTER_EMPTY)) {
        partial.lxTimeClassification = timeClass;
      }
      const bizCrit = (qp[QP.bizCrit] ?? '').trim();
      if (bizCrit && (CRITICALITY_VALUES.includes(bizCrit as (typeof CRITICALITY_VALUES)[number]) || bizCrit === SUITABILITY_FILTER_EMPTY)) {
        partial.businessCriticality = bizCrit;
      }
      const bizCap = (qp[QP.bizCap] ?? '').trim();
      if (bizCap) partial.relApplicationToBusinessCapability = bizCap;
      const userGroup = (qp[QP.userGroup] ?? '').trim();
      if (userGroup) partial.relApplicationToUserGroup = userGroup;
      const project = (qp[QP.project] ?? '').trim();
      if (project) partial.relApplicationToProject = project;
      const dataProduct = (qp[QP.dataProduct] ?? '').trim();
      if (dataProduct) partial.relApplicationToDataProduct = dataProduct;
      const platformTEMP = (qp[QP.platformTEMP] ?? '').trim();
      if (platformTEMP) partial.platformTEMP = platformTEMP;
      this.initialFilters.set(partial);
    });
  }

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
  }

  ngOnDestroy(): void {
    this.pageTitleService.clearTitle();
    this.patchTimers.forEach((t) => clearTimeout(t));
    this.patchTimers.clear();
    this.pendingPatches.clear();
  }

  /** Navigate to a new entity page with a random GUID (server may 404 until Save). */
  onNew(): void {
    const guid = crypto.randomUUID();
    this.router.navigate(['/entity', 'Application', guid]);
  }

  /** Open history dialog for a specific entity row. */
  openHistoryForRow(row: ListEntities200ResponseInner): void {
    if (!row.id) return;
    this.dialog.open(GitHistoryDialogComponent, {
      width: '70vw',
      height: '70vh',
      maxWidth: '90vw',
      maxHeight: '90vh',
      data: {
        entityId: row.id,
        entityType: row.type ?? 'Application',
        displayName: row.displayName ?? row.id,
      },
    });
  }

  /** Export the currently displayed (filtered) table as an Excel file, respecting column visibility. */
  async onExport(): Promise<void> {
    const rows = this.dataSource.data;
    if (!rows || rows.length === 0) return;

    // `file-saver` doesn't have consistent ESM named exports across bundlers/prod builds.
    // In some builds `import('file-saver')` returns `{ saveAs }`, in others it returns the function as `default`.
    const [ExcelJSModule, FileSaverModule] = await Promise.all([import('exceljs'), import('file-saver')]);
    const ExcelJSDefault = ExcelJSModule.default;
    const saveAsFn = (FileSaverModule as any)?.saveAs ?? (FileSaverModule as any)?.default ?? FileSaverModule;
    if (typeof saveAsFn !== 'function') {
      console.error('file-saver saveAs export not found', FileSaverModule);
      return;
    }

    const baseUrl = window.location.origin;

    const columnSerializers: Record<string, { header: string; value: (row: ListEntities200ResponseInner) => string }> = {
      lifecycle: {
        header: 'Lifecycle',
        value: (row) => this.getApplicationLifecycleAsString(row) || '',
      },
      displayName: {
        header: 'Name',
        value: (row) => row.displayName ?? '',
      },
      earmarkingsTEMP: {
        header: 'Earmarkings',
        value: (row) => row.earmarkingsTEMP ?? '',
      },
      platformTEMP: {
        header: 'Platform',
        value: (row) => row.platformTEMP ?? '',
      },
      lxTimeClassification: {
        header: 'TIME',
        value: (row) => row.lxTimeClassification ?? '',
      },
      migrationTarget: {
        header: 'Migration target',
        value: (row) => this.serializeMigrationTarget(row),
      },
      alternatives: {
        header: 'Alternatives',
        value: (row) => this.serializeAlternatives(row),
      },
      functionalSuitability: {
        header: 'Functional',
        value: (row) => row.functionalSuitability ?? '',
      },
      technicalSuitability: {
        header: 'Technical',
        value: (row) => row.technicalSuitability ?? '',
      },
      businessCriticality: {
        header: 'Business criticality',
        value: (row) => row.businessCriticality ?? '',
      },
      relApplicationToBusinessCapability: {
        header: 'Business Capability',
        value: (row) =>
          (row.relApplicationToBusinessCapability ?? [])
            .map((c) => c.displayName ?? c.fullName ?? c.id ?? '')
            .filter(Boolean)
            .join('\n'),
      },
      relApplicationToUserGroup: {
        header: 'User Group',
        value: (row) =>
          (row.relApplicationToUserGroup ?? [])
            .map((g) => g.displayName ?? g.fullName ?? g.id ?? '')
            .filter(Boolean)
            .join('\n'),
      },
      relApplicationToDataProduct: {
        header: 'Data Products',
        value: (row) =>
          (row.relApplicationToDataProduct ?? [])
            .map((p) => p.displayName ?? p.fullName ?? p.id ?? '')
            .filter(Boolean)
            .join('\n'),
      },
    };

    const visibleColumns = this.displayedColumns.filter((c) => c !== 'actions' && columnSerializers[c]);

    const wb = new ExcelJSDefault.Workbook();
    const ws = wb.addWorksheet('Applications');

    const headers = ['ID', ...visibleColumns.map((c) => columnSerializers[c].header), 'ZenEA'];
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true };

    ws.getColumn(1).hidden = true;

    rows.forEach((row) => {
      const values: (string | { text: string; hyperlink: string })[] = [
        row.id ?? '',
        ...visibleColumns.map((colId) => columnSerializers[colId].value(row)),
        { text: 'Open', hyperlink: `${baseUrl}/entity/Application/${row.id ?? ''}` },
      ];
      ws.addRow(values);
    });

    const wrapTopAlign: Partial<ExcelJS.Alignment> = { wrapText: true, vertical: 'top' };
    ws.eachRow((excelRow) => {
      excelRow.alignment = wrapTopAlign;
    });

    const linkColIdx = headers.length;
    ws.getColumn(linkColIdx).eachCell({ includeEmpty: false }, (cell, rowNumber) => {
      if (rowNumber > 1) {
        cell.font = { color: { argb: 'FF0563C1' }, underline: true };
      }
    });

    const CHAR_WIDTH = 1.2;
    const MIN_COL_WIDTH = 8;
    const MAX_COL_WIDTH = 60;
    ws.columns.forEach((col) => {
      let maxLen = MIN_COL_WIDTH;
      col.eachCell!({ includeEmpty: false }, (cell) => {
        const text = cell.value != null ? String(typeof cell.value === 'object' && 'text' in cell.value ? cell.value.text : cell.value) : '';
        const lines = text.split('\n');
        const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
        if (longest > maxLen) maxLen = longest;
      });
      col.width = Math.min(maxLen * CHAR_WIDTH, MAX_COL_WIDTH);
    });

    const buffer = await wb.xlsx.writeBuffer();
    saveAsFn(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      'applications.xlsx'
    );
  }

  /** Serialize alternatives for export: one line per target with overlap and comment. */
  private serializeAlternatives(row: ListEntities200ResponseInner): string {
    const arr = row.alternatives;
    if (!Array.isArray(arr) || arr.length === 0) return '';
    return arr
      .map((m) => {
        const name = m?.displayName ?? m?.id ?? '';
        const parts: string[] = [];
        if (m.functionalOverlap != null && m.functionalOverlap !== 100) parts.push(`${m.functionalOverlap}% overlap`);
        if (m.comment != null && String(m.comment).trim() !== '') parts.push(String(m.comment).trim());
        return parts.length ? `${name} — ${parts.join('; ')}` : name;
      })
      .filter(Boolean)
      .join('\n');
  }

  /** Serialize migration targets for export: "DisplayName - 50% P1, L, Q2/23" per line. */
  private serializeMigrationTarget(row: ListEntities200ResponseInner): string {
    const arr = row.migrationTarget;
    if (!Array.isArray(arr) || arr.length === 0) return '';
    return arr
      .map((m) => {
        const name = m?.displayName ?? m?.id ?? '';
        const parts: string[] = [];
        if (m.lifecycle) parts.push(String(m.lifecycle));
        if (m.proportion != null && m.proportion !== 100) parts.push(`${m.proportion}%`);
        if (m.priority != null) parts.push(`P${m.priority}`);
        if (m.effort) parts.push(String(m.effort));
        if (m.eta) parts.push(String(m.eta));
        return parts.length ? `${name} - ${parts.join(', ')}` : name;
      })
      .filter(Boolean)
      .join('\n');
  }

  onFiltersChange(filters: EntityListFilters): void {
    const params: Record<string, string> = {};
    if (filters.name?.trim()) params[QP.name] = filters.name.trim();
    if (filters.technicalSuitability) params[QP.techSuit] = filters.technicalSuitability;
    if (filters.functionalSuitability) params[QP.bizSuit] = filters.functionalSuitability;
    if (filters.lxTimeClassification) params[QP.timeClass] = filters.lxTimeClassification;
    if (filters.businessCriticality) params[QP.bizCrit] = filters.businessCriticality;
    if (filters.relApplicationToBusinessCapability) params[QP.bizCap] = filters.relApplicationToBusinessCapability;
    if (filters.relApplicationToUserGroup) params[QP.userGroup] = filters.relApplicationToUserGroup;
    if (filters.relApplicationToProject) params[QP.project] = filters.relApplicationToProject;
    if (filters.relApplicationToDataProduct) params[QP.dataProduct] = filters.relApplicationToDataProduct;
    if (filters.platformTEMP) params[QP.platformTEMP] = filters.platformTEMP;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: '',
      replaceUrl: true,
    });
    this.nameFilter.set(filters.name?.trim() ?? '');
    this.timeClassificationFilter.set(filters.lxTimeClassification ?? '');
    this.businessCriticalityFilter.set(filters.businessCriticality ?? '');
    const serverKey = `${filters.technicalSuitability}|${filters.functionalSuitability}|${filters.relApplicationToBusinessCapability}|${filters.relApplicationToUserGroup}|${filters.relApplicationToDataProduct}|${filters.relApplicationToProject}|${filters.platformTEMP}`;
    if (this.lastServerFilters() !== serverKey) {
      this.lastServerFilters.set(serverKey);
      this.loadEntities(filters);
    } else {
      this.applyNameFilterToDataSource();
    }
  }

  /** Match entity by displayName ++ earmarkingsTEMP, business capabilities' displayName, or userGroup displayName containing the text (case-insensitive). */
  private filterEntitiesByName(
    list: ListEntities200ResponseInner[],
    nameText: string
  ): ListEntities200ResponseInner[] {
    const q = (nameText ?? '').trim().toLowerCase();
    if (!q) return list;
    return list.filter((entity) => {
      const nameAndEarmarkings = [entity.displayName ?? '', entity.earmarkingsTEMP ?? ''].filter(Boolean).join(' ');
      if (nameAndEarmarkings.toLowerCase().includes(q)) return true;
      const caps = entity.relApplicationToBusinessCapability ?? [];
      if (caps.some((c) => (c.displayName ?? '').toLowerCase().includes(q))) return true;
      const groups = entity.relApplicationToUserGroup ?? [];
      if (groups.some((g) => (g.displayName ?? g.fullName ?? '').toLowerCase().includes(q))) return true;
      const dataProducts = entity.relApplicationToDataProduct ?? [];
      if (dataProducts.some((p) => (p.displayName ?? p.fullName ?? '').toLowerCase().includes(q))) return true;
      if (this.serializeMigrationTarget(entity).toLowerCase().includes(q)) return true;
      if (this.serializeAlternatives(entity).toLowerCase().includes(q)) return true;
      return false;
    });
  }

  /** Apply client-side filters (name, TIME classification, business criticality) to the given list. */
  private applyClientSideFilters(
    list: ListEntities200ResponseInner[],
    nameText: string,
    timeClassification: string,
    businessCriticality: string
  ): ListEntities200ResponseInner[] {
    let result = this.filterEntitiesByName(list, nameText);
    if (timeClassification) {
      if (timeClassification === SUITABILITY_FILTER_EMPTY) {
        result = result.filter((e) => !e.lxTimeClassification || (e.lxTimeClassification as string).trim() === '');
      } else {
        result = result.filter(
          (e) => (e.lxTimeClassification ?? '').toString().toLowerCase() === timeClassification.toLowerCase()
        );
      }
    }
    if (businessCriticality) {
      if (businessCriticality === SUITABILITY_FILTER_EMPTY) {
        result = result.filter((e) => !e.businessCriticality || (e.businessCriticality as string).trim() === '');
      } else {
        result = result.filter(
          (e) => (e.businessCriticality ?? '').toString().toLowerCase() === businessCriticality.toLowerCase()
        );
      }
    }
    return result;
  }

  private applyNameFilterToDataSource(): void {
    this.dataSource.data = this.applyClientSideFilters(
      this.allEntities(),
      this.nameFilter(),
      this.timeClassificationFilter(),
      this.businessCriticalityFilter()
    );
    this.displayedCount.set(this.dataSource.data.length);
  }

  /** Clear list and show loading spinner (e.g. before branch switch). */
  private showLoadingState(): void {
    this.loading.set(true);
    this.error.set(null);
    this.entities.set([]);
    this.allEntities.set([]);
    this.dataSource.data = [];
    this.displayedCount.set(0);
  }

  private loadEntities(filters: EntityListFilters): void {
    this.lastLoadFilters.set(filters);
    this.loading.set(true);
    this.error.set(null);
    this.entityService
      .listEntities(
        undefined,
        filters.technicalSuitability || undefined,
        filters.functionalSuitability || undefined,
        filters.relApplicationToBusinessCapability || undefined,
        filters.relApplicationToUserGroup || undefined,
        filters.relApplicationToProject || undefined,
        filters.relApplicationToDataProduct || undefined,
        filters.platformTEMP || undefined
      )
      .subscribe({
        next: (list) => {
          this.allEntities.set(list ?? []);
          this.entities.set(list ?? []);
          this.applyNameFilterToDataSource();
          this.loading.set(false);
          setTimeout(() => {
            this.dataSource.sort = this.sort;
          }, 0);
        },
        error: (err) => {
          this.error.set(err?.message ?? 'Failed to load entities.');
          this.entities.set([]);
          this.allEntities.set([]);
          this.dataSource.data = [];
          this.displayedCount.set(0);
          this.loading.set(false);
        },
      });
  }
}
