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

import { Component, signal, computed, inject, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, ChangeDetectorRef, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { DotDateAdapter, DOT_DATE_FORMATS } from '../../services/dot-date-adapter';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TextFieldModule } from '@angular/cdk/text-field';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ApplicationsService } from '../../services/ApplicationsService';
import { EntityApiService } from '../../services/entity-api.service';
import { UserConfigService } from '../../services/user-config.service';
import { PageTitleService } from '../../services/page-title.service';
import { AuthorizationService } from '../../services/authorization.service';
import { MigrationTargetItem, MIGRATION_TARGET_LIFECYCLE_OPTIONS, MIGRATION_TARGET_PRIORITY_OPTIONS, MIGRATION_TARGET_EFFORT_OPTIONS, MIGRATION_TARGET_BENEFIT_OPTIONS, generateMigrationTargetEtaOptions } from '../../models/migration-target-item';
import { ListFiltersComponent, SUITABILITY_FILTER_EMPTY, parseVisiblePills } from '../../components/list-filters/list-filters.component';
import { EntityListFilters, emptyEntityListFilters, STATUS_URL_ALL } from '../../models/entity-list-filters';
import { TECHNICAL_SUITABILITY_VALUES, FUNCTIONAL_SUITABILITY_VALUES } from '../../components/suitability-rating/suitability-rating.component';
import { TIME_CLASSIFICATION_VALUES } from '../../components/time-classification/time-classification.component';
import { NORTH_STAR_CLASSIFICATION_VALUES } from '../../components/north-star-classification/north-star-classification.component';
import { CRITICALITY_VALUES } from '../../components/suitability-rating/suitability-rating.component';
import { UserGroupPillComponent } from '../../components/user-group-pill/user-group-pill.component';
import { UserGroupsDataService, UserGroupItem } from '../../services/UserGroupsDataService';
import { MigrationTargetDialogComponent } from '../../components/migration-target-dialog/migration-target-dialog.component';
import { HoverInfoOverlayService } from '../../services/hover-info-overlay.service';
import { readRelationItems } from '../../utils/relation-data';
import type ExcelJS from 'exceljs';

const QP = {
  name: 'name',
  status: 'status',
  techSuit: 'techSuit',
  bizSuit: 'bizSuit',
  timeClass: 'timeClass',
  bizCrit: 'bizCrit',
  bizCap: 'bizCap',
  bizCapMode: 'bizCapMode',
  userGroup: 'userGroup',
  userGroupMode: 'userGroupMode',
  project: 'project',
  dataProduct: 'dataProduct',
  tags: 'tags',
  tagGroups: 'tagGroups',
  customFields: 'cf',
  customFieldIds: 'cfIds',
  northStar: 'northStar',
  pills: 'pills',
  appSide: 'appSide',
  lifecycle: 'lifecycle',
  priority: 'priority',
  etaFrom: 'etaFrom',
  etaTo: 'etaTo',
} as const;

/** URL marker for a multi-select filter that has no value selected. An absent param
 *  means "default selection" instead, so both states survive a page reload. */
const MULTI_FILTER_NONE = 'NONE';

/** Lifecycle values that stay selected when no lifecycle param is present in the URL. */
const DEFAULT_LIFECYCLE_FILTER = MIGRATION_TARGET_LIFECYCLE_OPTIONS.filter((lc) => lc !== 'Done' && lc !== 'Discarded');

/** Convert an ETA value ("YY/Qn" or "YYYY/Qn") into a comparable quarter index. Null when unparseable. */
function etaQuarterIndex(eta: string | null | undefined): number | null {
  if (!eta) return null;
  const match = /^(\d{2}|\d{4})\/Q([1-4])$/.exec(eta.trim());
  if (!match) return null;
  const year = match[1].length === 2 ? 2000 + parseInt(match[1], 10) : parseInt(match[1], 10);
  return year * 4 + parseInt(match[2], 10);
}

export interface MigrationRow {
  uid: string;
  sourceAppId: string;
  sourceDisplayName: string;
  targetAppId: string;
  targetDisplayName: string;
  lifecycle: string | null;
  proportion: number;
  priority: number | null;
  effort: string | null;
  benefit: string | null;
  eta: string | null;
  startDate: string | null;
  endDate: string | null;
  projectReference: string | null;
  comments: string | null;
  userGroup: Array<{ id: string; displayName: string; fullName?: string }> | null;
}

@Component({
  selector: 'app-migrations-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatMenuModule,
    TextFieldModule,
    TranslatePipe,
    ListFiltersComponent,
    UserGroupPillComponent,
  ],
  providers: [
    { provide: DateAdapter, useClass: DotDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: DOT_DATE_FORMATS },
  ],
  templateUrl: './migrations-list.component.html',
  styleUrl: './migrations-list.component.scss',
})
export class MigrationsListComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('tableContainer', { read: ElementRef }) private tableContainer!: ElementRef<HTMLElement>;

  /** Number of placeholder rows shown while the data is still loading. */
  readonly SKELETON_ROWS = Array.from({ length: 16 }, (_, i) => i);

  /** Column indexes used to place skeleton bars (13 columns in this table). */
  readonly skeletonCells = Array.from({ length: 13 }, (_, i) => i);

  /** Row height in pixels for virtual scroll calculations. */
  private readonly ROW_HEIGHT = 52;

  /** Number of extra rows to render above/below the viewport for smooth scrolling. */
  private readonly BUFFER_ROWS = 10;

  /** Current scroll offset in pixels. */
  private scrollTop = signal(0);

  /** Visible rows computed from scroll position for lightweight virtual scrolling. */
  readonly virtualRows = computed(() => {
    const allRows = this.sortedRows();
    if (allRows.length === 0) {
      return { visibleRows: [] as MigrationRow[], topHeight: 0, bottomHeight: 0, totalHeight: 0 };
    }

    const viewportHeight = this.tableContainer?.nativeElement?.clientHeight ?? 600;
    const scrollTop = this.scrollTop();
    const headerHeight = 56;

    const startRow = Math.max(0, Math.floor((scrollTop - this.BUFFER_ROWS * this.ROW_HEIGHT) / this.ROW_HEIGHT));
    const visibleCount = Math.ceil((viewportHeight + 2 * this.BUFFER_ROWS * this.ROW_HEIGHT) / this.ROW_HEIGHT);
    const endRow = Math.min(allRows.length, startRow + visibleCount);

    return {
      visibleRows: allRows.slice(startRow, endRow),
      topHeight: startRow * this.ROW_HEIGHT,
      bottomHeight: (allRows.length - endRow) * this.ROW_HEIGHT,
      totalHeight: headerHeight + allRows.length * this.ROW_HEIGHT,
    };
  });

  readonly LIFECYCLE_OPTIONS = [...MIGRATION_TARGET_LIFECYCLE_OPTIONS];
  readonly PRIORITY_OPTIONS = [...MIGRATION_TARGET_PRIORITY_OPTIONS];
  readonly EFFORT_OPTIONS = [...MIGRATION_TARGET_EFFORT_OPTIONS];
  readonly BENEFIT_OPTIONS = [...MIGRATION_TARGET_BENEFIT_OPTIONS];
  readonly ETA_OPTIONS = generateMigrationTargetEtaOptions();

  private applicationsService = inject(ApplicationsService);
  private entityApi = inject(EntityApiService);
  userConfig = inject(UserConfigService);
  private pageTitleService = inject(PageTitleService);
  private authorization = inject(AuthorizationService);
  private snackBar = inject(MatSnackBar);
  private cdr = inject(ChangeDetectorRef);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private userGroupsDataService = inject(UserGroupsDataService);
  private translate = inject(TranslateService);
  private hoverInfoOverlay = inject(HoverInfoOverlayService);

  readonly canEdit = this.authorization.canEdit;
  loading = signal(true);

  /** Row currently targeted by the inline user-group menu. */
  activeUgRow = signal<MigrationRow | null>(null);

  /** App IDs whose migrationTarget has been edited locally and not yet ack'd by the API. */
  pendingAppIds = signal<Set<string>>(new Set<string>());
  /** Number of PATCH requests currently in flight (across all apps). */
  inflightSaves = signal(0);
  /** Error from the last save attempt (any app). */
  saveError = signal<string | null>(null);

  /** True while at least one save is in flight. */
  readonly isSaving = computed(() => this.inflightSaves() > 0);
  /** True if there is at least one pending app, any in-flight save, or a recent error. */
  readonly hasPendingChanges = computed(
    () => this.pendingAppIds().size > 0 || this.inflightSaves() > 0 || this.saveError() !== null,
  );

  /** Debounce delay for auto-save in milliseconds. */
  private readonly AUTOSAVE_DEBOUNCE_MS = 5_000;
  /** Debounce timers per source app ID. Each app is saved independently
   *  — editing app A never postpones the save for app B. */
  private patchTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** All migration rows flattened from all applications. */
  rows = signal<MigrationRow[]>([]);

  /** Lifecycle multi-select filter (all except 'Done' and 'Discarded' by default). */
  filterLifecycle = signal<string[]>([...DEFAULT_LIFECYCLE_FILTER]);
  /** Priority multi-select filter (all unselected by default = no priority filtering). */
  filterPriority = signal<number[]>([]);
  /** ETA range filter lower bound (undefined = unbounded). */
  filterEtaFrom = signal<string | null>(null);
  /** ETA range filter upper bound (undefined = unbounded). */
  filterEtaTo = signal<string | null>(null);
  filterEffort = signal<string | null>(null);
  filterBenefit = signal<string | null>(null);

  /** Application filter side: which side(s) must match the application-level filters. */
  readonly APP_SIDE_OPTIONS = ['Source', 'Target'] as const;
  filterAppSide = signal<string[]>(['Source', 'Target']);

  /** Toggle for showing the effort×benefit heatmap. */
  showHeatmap = signal(true);

  /** Grid click filter: when set, locks effort and benefit to that cell. */
  gridFilterEffort = signal<string | null>(null);
  gridFilterBenefit = signal<string | null>(null);

  /** Grid axis options (5 actual values). */
  readonly GRID_OPTIONS: Array<string | null> = [...MIGRATION_TARGET_EFFORT_OPTIONS];

  /** Rows filtered by lifecycle, priority, ETA range and app-level filters (for grid counts). */
  lifecycleFilteredRows = computed(() => {
    let data = this.rows();
    const lc = this.filterLifecycle();
    if (lc.length > 0) data = data.filter((r) => r.lifecycle != null && lc.includes(r.lifecycle));
    data = this.applyPriorityFilter(data);
    data = this.applyEtaFilter(data);

    const filters = this.currentFilters();
    if (filters.name) {
      const nameLower = filters.name.toLowerCase();
      const tokens = nameLower.split(/\s+/).filter(Boolean);
      data = data.filter((r) => {
        const haystack = `${r.sourceDisplayName} ${r.targetDisplayName}`.toLowerCase();
        return tokens.every((t) => haystack.includes(t));
      });
    }

    const hasNonNameAppFilters = (filters.status && filters.status !== 'ACTIVE') ||
      filters.technicalSuitability || filters.functionalSuitability ||
      filters.lxTimeClassification || filters.northStarClassification ||
      filters.businessCriticality || filters.relApplicationToBusinessCapability ||
      filters.relApplicationToUserGroup || filters.relApplicationToProject ||
      filters.relApplicationToDataProduct ||
      (filters.tags && filters.tags.length > 0) ||
      (filters.customFields && Object.keys(filters.customFields).length > 0);

    if (hasNonNameAppFilters) {
      const filteredApps = this.applicationsService.applyFilters({
        status: filters.status,
        technicalSuitability: filters.technicalSuitability,
        functionalSuitability: filters.functionalSuitability,
        lxTimeClassification: filters.lxTimeClassification,
        northStarClassification: filters.northStarClassification,
        businessCriticality: filters.businessCriticality,
        relApplicationToBusinessCapability: filters.relApplicationToBusinessCapability,
        relApplicationToBusinessCapabilityMode: filters.relApplicationToBusinessCapabilityMode,
        relApplicationToUserGroup: filters.relApplicationToUserGroup,
        relApplicationToUserGroupMode: filters.relApplicationToUserGroupMode,
        relApplicationToProject: filters.relApplicationToProject,
        relApplicationToDataProduct: filters.relApplicationToDataProduct,
        migrationFilter: filters.migrationFilter,
        tags: filters.tags,
        customFields: filters.customFields,
      });
      const matchingIds = new Set(filteredApps.map((a) => a.id));
      const side = this.filterAppSide();
      const bySource = side.includes('Source');
      const byTarget = side.includes('Target');
      data = data.filter((r) => (bySource && matchingIds.has(r.sourceAppId)) || (byTarget && matchingIds.has(r.targetAppId)));
    }

    return data;
  });

  /** Grid cell counts: rows = benefit axis, cols = effort axis. */
  gridCounts = computed(() => {
    const data = this.lifecycleFilteredRows();
    const rows = this.GRID_OPTIONS.length;
    const cols = this.GRID_OPTIONS.length;
    const counts: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
    for (const r of data) {
      const ri = this.GRID_OPTIONS.indexOf(r.benefit);
      const ci = this.GRID_OPTIONS.indexOf(r.effort);
      if (ri >= 0 && ci >= 0) counts[ri][ci]++;
    }
    return counts;
  });

  /** Keep only rows whose priority is in the multi-select filter (no-op when nothing is selected).
   *  Shared by the table and the heatmap counts so both always agree. */
  private applyPriorityFilter(data: MigrationRow[]): MigrationRow[] {
    const pr = this.filterPriority();
    if (pr.length === 0) return data;
    return data.filter((r) => r.priority != null && pr.includes(r.priority));
  }

  /** Keep only rows whose ETA lies within the optional [from, to] range (inclusive).
   *  Rows without a parseable ETA are dropped as soon as one bound is set.
   *  Shared by the table and the heatmap counts so both always agree. */
  private applyEtaFilter(data: MigrationRow[]): MigrationRow[] {
    const etaFrom = this.filterEtaFrom();
    const etaTo = this.filterEtaTo();
    if (etaFrom == null && etaTo == null) return data;
    const fromIdx = etaQuarterIndex(etaFrom);
    const toIdx = etaQuarterIndex(etaTo);
    return data.filter((r) => {
      const idx = etaQuarterIndex(r.eta);
      if (idx == null) return false;
      if (fromIdx != null && idx < fromIdx) return false;
      if (toIdx != null && idx > toIdx) return false;
      return true;
    });
  }

  /** Application-level filters from <app-list-filters>. */
  currentFilters = signal<EntityListFilters>(emptyEntityListFilters());
  initialFilters = signal<Partial<EntityListFilters>>({});

  /** Current sort column (null = no sort). */
  sortColumn = signal<string | null>(null);
  /** Current sort direction: 'asc' or 'desc'. */
  sortDirection = signal<'asc' | 'desc'>('asc');

  /** Filtered rows. */
  filteredRows = computed(() => {
    let data = this.rows();
    const lc = this.filterLifecycle();
    const ef = this.filterEffort();
    const bn = this.filterBenefit();
    const ge = this.gridFilterEffort();
    const gb = this.gridFilterBenefit();
    if (lc.length > 0) data = data.filter((r) => r.lifecycle != null && lc.includes(r.lifecycle));
    data = this.applyPriorityFilter(data);
    data = this.applyEtaFilter(data);
    if (ef != null) data = data.filter((r) => r.effort === ef);
    if (bn != null) data = data.filter((r) => r.benefit === bn);
    if (ge != null) data = data.filter((r) => r.effort === ge);
    if (gb != null) data = data.filter((r) => r.benefit === gb);

    const filters = this.currentFilters();

    // Name filter: search both source AND target display names (migration-specific).
    if (filters.name) {
      const nameLower = filters.name.toLowerCase();
      const tokens = nameLower.split(/\s+/).filter(Boolean);
      data = data.filter((r) => {
        const haystack = `${r.sourceDisplayName} ${r.targetDisplayName}`.toLowerCase();
        return tokens.every((t) => haystack.includes(t));
      });
    }

    // Application-level filters (status, suitability, tags, etc.): keep rows
    // where source OR target app matches the filtered application set.
    const hasNonNameAppFilters = (filters.status && filters.status !== 'ACTIVE') ||
      filters.technicalSuitability || filters.functionalSuitability ||
      filters.lxTimeClassification || filters.northStarClassification ||
      filters.businessCriticality || filters.relApplicationToBusinessCapability ||
      filters.relApplicationToUserGroup || filters.relApplicationToProject ||
      filters.relApplicationToDataProduct ||
      (filters.tags && filters.tags.length > 0) ||
      (filters.customFields && Object.keys(filters.customFields).length > 0);

    if (hasNonNameAppFilters) {
      const filteredApps = this.applicationsService.applyFilters({
        status: filters.status,
        technicalSuitability: filters.technicalSuitability,
        functionalSuitability: filters.functionalSuitability,
        lxTimeClassification: filters.lxTimeClassification,
        northStarClassification: filters.northStarClassification,
        businessCriticality: filters.businessCriticality,
        relApplicationToBusinessCapability: filters.relApplicationToBusinessCapability,
        relApplicationToBusinessCapabilityMode: filters.relApplicationToBusinessCapabilityMode,
        relApplicationToUserGroup: filters.relApplicationToUserGroup,
        relApplicationToUserGroupMode: filters.relApplicationToUserGroupMode,
        relApplicationToProject: filters.relApplicationToProject,
        relApplicationToDataProduct: filters.relApplicationToDataProduct,
        migrationFilter: filters.migrationFilter,
        tags: filters.tags,
        customFields: filters.customFields,
      });
      const matchingIds = new Set(filteredApps.map((a) => a.id));
      const side = this.filterAppSide();
      const bySource = side.includes('Source');
      const byTarget = side.includes('Target');
      data = data.filter((r) => (bySource && matchingIds.has(r.sourceAppId)) || (byTarget && matchingIds.has(r.targetAppId)));
    }

    return data;
  });

  /** Rows after applying sort. */
  sortedRows = computed(() => {
    const data = this.filteredRows();
    const col = this.sortColumn();
    const dir = this.sortDirection();
    if (!col) return data;

    const sorted = [...data];
    sorted.sort((a, b) => {
      let va: any = (a as any)[col];
      let vb: any = (b as any)[col];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (col === 'proportion' || col === 'priority') {
        return dir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
      }
      if (col === 'startDate' || col === 'endDate') {
        const da = va ? new Date(va).getTime() : 0;
        const db = vb ? new Date(vb).getTime() : 0;
        return dir === 'asc' ? da - db : db - da;
      }
      const sa = String(va).toLowerCase();
      const sb = String(vb).toLowerCase();
      return dir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return sorted;
  });

  constructor() {
    effect(() => {
      const isLoading = this.applicationsService.loading();
      const apps = this.applicationsService.applications();
      if (!isLoading && apps.length > 0) {
        this.buildRows();
      }
    });
  }

  ngOnInit(): void {
    this.pageTitleService.setTitle('Migrations');
    this.readInitialFiltersFromUrl();
    this.applicationsService.ensureLoaded();
    this.userGroupsDataService.ensureLoaded();
  }

  ngAfterViewInit(): void {
    this.tableContainer?.nativeElement && this.onTableScroll({ target: this.tableContainer.nativeElement } as unknown as Event);
  }

  onTableScroll(event: Event): void {
    const target = event.target as HTMLElement;
    if (target) {
      this.scrollTop.set(target.scrollTop);
    }
    this.hoverInfoOverlay.hide();
  }

  ngOnDestroy(): void {
    this.hoverInfoOverlay.hide();
    this.pageTitleService.clearTitle();
    this.patchTimers.forEach((t) => clearTimeout(t));
    this.patchTimers.clear();
  }

  /**
   * Show the description + comment overlay while the cursor hovers a source or
   * target application name. The overlay closes when the cursor leaves the name
   * (onAppLinkLeave) without moving onto the overlay, on scrolling, or on destroy.
   */
  onAppLinkEnter(event: Event, appId: string): void {
    const app = this.applicationsService.applications().find((a) => a.id === appId);
    this.hoverInfoOverlay.show(event.currentTarget as Element, app ?? null);
  }

  /** Hide the overlay when the cursor leaves a source or target application name. */
  onAppLinkLeave(event: Event): void {
    this.hoverInfoOverlay.scheduleHide(event.currentTarget as Element);
  }

  /** Flush every queued app's debounced save immediately. */
  saveNow(): void {
    const sourceIds = [...this.patchTimers.keys()];
    for (const id of sourceIds) {
      const t = this.patchTimers.get(id);
      if (t) clearTimeout(t);
      this.patchTimers.delete(id);
      this.saveSourceAppMigrationTarget(id);
    }
  }

  trackRowByUid(_index: number, row: MigrationRow): string {
    return row.uid;
  }

  /** Cycle sort on a column: none → asc → desc → none. */
  onSort(column: string): void {
    const current = this.sortColumn();
    const dir = this.sortDirection();
    if (current === column) {
      if (dir === 'asc') {
        this.sortDirection.set('desc');
      } else {
        this.sortColumn.set(null);
      }
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
  }

  getSortIcon(column: string): string {
    if (this.sortColumn() !== column) return '';
    return this.sortDirection() === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  /** Set a column filter. Clicking the same value again clears it. */
  setFilter(column: 'effort' | 'benefit', value: any): void {
    switch (column) {
      case 'effort':
        this.filterEffort.set(this.filterEffort() === value ? null : value);
        break;
      case 'benefit':
        this.filterBenefit.set(this.filterBenefit() === value ? null : value);
        break;
    }
  }

  /** Check if a filter is active. */
  isFilterActive(column: 'effort' | 'benefit', value: any): boolean {
    switch (column) {
      case 'effort': return this.filterEffort() === value;
      case 'benefit': return this.filterBenefit() === value;
    }
  }

  /** Check if any column filter is active. */
  hasActiveFilter(): boolean {
    return this.filterPriority().length > 0 || this.filterEffort() != null || this.filterBenefit() != null
      || this.filterEtaFrom() != null || this.filterEtaTo() != null
      || this.gridFilterEffort() != null || this.gridFilterBenefit() != null
      || this.filterLifecycle().length < MIGRATION_TARGET_LIFECYCLE_OPTIONS.length;
  }

  /** Clear all column filters. */
  clearFilters(): void {
    this.filterLifecycle.set([...MIGRATION_TARGET_LIFECYCLE_OPTIONS]);
    this.filterPriority.set([]);
    this.filterEffort.set(null);
    this.filterBenefit.set(null);
    this.gridFilterEffort.set(null);
    this.gridFilterBenefit.set(null);
    this.filterEtaFrom.set(null);
    this.filterEtaTo.set(null);
    this.persistLocalFilters();
  }

  /** Toggle a lifecycle value in the multi-select filter. */
  toggleLifecycleFilter(value: string): void {
    this.filterLifecycle.update((prev) => {
      if (prev.includes(value)) {
        return prev.filter((v) => v !== value);
      }
      return [...prev, value];
    });
    this.persistLocalFilters();
  }

  /** Application Filter side selection changed: apply and persist to the URL. */
  onAppSideChange(sides: string[]): void {
    this.filterAppSide.set(sides);
    this.persistLocalFilters();
  }

  /** Lifecycle multi-select changed: apply and persist to the URL. */
  onLifecycleChange(lifecycles: string[]): void {
    this.filterLifecycle.set(lifecycles);
    this.persistLocalFilters();
  }

  /** Priority multi-select changed: apply and persist to the URL. */
  onPriorityChange(priorities: number[]): void {
    this.filterPriority.set(priorities);
    this.persistLocalFilters();
  }

  /** ETA lower bound changed: apply and persist to the URL. */
  onEtaFromChange(eta: string | null): void {
    this.filterEtaFrom.set(eta);
    this.persistLocalFilters();
  }

  /** ETA upper bound changed: apply and persist to the URL. */
  onEtaToChange(eta: string | null): void {
    this.filterEtaTo.set(eta);
    this.persistLocalFilters();
  }

  /** Persist the migration-specific filters (application side, lifecycle, priority, ETA range)
   *  as URL query params so they survive a page reload — same concept as onFiltersChange(). */
  private persistLocalFilters(): void {
    const params: Record<string, string | null> = {
      [QP.appSide]: this.serializeMultiFilter(this.filterAppSide(), this.APP_SIDE_OPTIONS),
      [QP.lifecycle]: this.serializeMultiFilter(this.filterLifecycle(), DEFAULT_LIFECYCLE_FILTER),
      [QP.priority]: this.serializeMultiFilter(this.filterPriority().map(String), []),
      [QP.etaFrom]: this.filterEtaFrom(),
      [QP.etaTo]: this.filterEtaTo(),
    };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Serialize a multi-select filter for the URL: null = default selection (param dropped),
   *  'NONE' = nothing selected, comma-joined values otherwise. */
  private serializeMultiFilter(values: string[], defaults: readonly string[]): string | null {
    const isDefault = values.length === defaults.length && defaults.every((d) => values.includes(d));
    if (isDefault) return null;
    return values.length > 0 ? values.join(',') : MULTI_FILTER_NONE;
  }

  /** Parse a comma-separated multi-select query param against the allowed values.
   *  Returns null when the param is absent or holds no known value (keep the default). */
  private parseMultiFilter(raw: unknown, allowed: readonly string[]): string[] | null {
    const value = (raw ?? '').toString().trim();
    if (!value) return null;
    if (value === MULTI_FILTER_NONE) return [];
    const values = value.split(',').map((v) => v.trim()).filter((v) => allowed.includes(v));
    return values.length > 0 ? values : null;
  }

  /** Handle grid cell click: toggle effort+benefit filter. */
  onGridCellClick(effort: string | null, benefit: string | null): void {
    if (this.gridFilterEffort() === effort && this.gridFilterBenefit() === benefit) {
      this.gridFilterEffort.set(null);
      this.gridFilterBenefit.set(null);
    } else {
      this.gridFilterEffort.set(effort);
      this.gridFilterBenefit.set(benefit);
    }
  }

  /** Check if a grid cell is the active filter. */
  isGridCellActive(effort: string | null, benefit: string | null): boolean {
    return this.gridFilterEffort() === effort && this.gridFilterBenefit() === benefit;
  }

  /** Get background color for a grid cell based on position (green top-left → yellow center → red bottom-right). */
  getGridCellBackground(row: number, col: number): string {
    const n = this.GRID_OPTIONS.length - 1;
    const t = (row + col) / (2 * n);
    let r: number, g: number, b: number;
    if (t <= 0.5) {
      const s = t * 2;
      r = Math.round(34 + (255 - 34) * s);
      g = Math.round(139 + (230 - 139) * s);
      b = Math.round(34 + (0 - 34) * s);
    } else {
      const s = (t - 0.5) * 2;
      r = Math.round(255 + (220 - 255) * s);
      g = Math.round(230 + (34 - 230) * s);
      b = Math.round(0 + (34 - 0) * s);
    }
    return `rgba(${r}, ${g}, ${b}, 0.25)`;
  }

  /** Handle filter changes from <app-list-filters>. */
  onFiltersChange(filters: EntityListFilters): void {
    this.currentFilters.set(filters);
    this.initialFilters.set(filters);
    const params: Record<string, string | null> = {
      [QP.name]: filters.name?.trim() || null,
      [QP.status]: filters.status === 'ACTIVE' ? null : filters.status || STATUS_URL_ALL,
      [QP.techSuit]: filters.technicalSuitability || null,
      [QP.bizSuit]: filters.functionalSuitability || null,
      [QP.timeClass]: filters.lxTimeClassification || null,
      [QP.northStar]: filters.northStarClassification || null,
      [QP.bizCrit]: filters.businessCriticality || null,
      [QP.bizCap]: filters.relApplicationToBusinessCapability || null,
      [QP.bizCapMode]: filters.relApplicationToBusinessCapabilityMode === 'exact' ? 'exact' : null,
      [QP.userGroup]: filters.relApplicationToUserGroup || null,
      [QP.userGroupMode]: filters.relApplicationToUserGroupMode === 'exact' ? 'exact' : null,
      [QP.project]: filters.relApplicationToProject || null,
      [QP.dataProduct]: filters.relApplicationToDataProduct || null,
      [QP.tags]: filters.tags && filters.tags.length > 0 ? filters.tags.join(',') : null,
      [QP.tagGroups]: filters.tagGroups && filters.tagGroups.length > 0 ? filters.tagGroups.join(',') : null,
      [QP.customFields]: filters.customFields && Object.keys(filters.customFields).length > 0 ? JSON.stringify(filters.customFields) : null,
      [QP.customFieldIds]: filters.customFieldIds && filters.customFieldIds.length > 0 ? filters.customFieldIds.join(',') : null,
      [QP.pills]: filters.visiblePills && filters.visiblePills.length > 0 ? filters.visiblePills.join(',') : null,
    };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Read initial filter values from URL query params. */
  private readInitialFiltersFromUrl(): void {
    const qp = this.route.snapshot.queryParams;
    const partial: Partial<EntityListFilters> = {};
    const name = (qp[QP.name] ?? '').trim();
    if (name) partial.name = name;
    const status = (qp[QP.status] ?? '').trim().toUpperCase();
    if (status === STATUS_URL_ALL) {
      partial.status = '';
    } else if (status === 'ACTIVE' || status === 'ARCHIVED') {
      partial.status = status;
    }
    const tech = (qp[QP.techSuit] ?? '').trim();
    if (tech && (TECHNICAL_SUITABILITY_VALUES.includes(tech as (typeof TECHNICAL_SUITABILITY_VALUES)[number]) || tech === SUITABILITY_FILTER_EMPTY)) {
      partial.technicalSuitability = tech;
    }
    const biz = (qp[QP.bizSuit] ?? '').trim();
    if (biz && (FUNCTIONAL_SUITABILITY_VALUES.includes(biz as (typeof FUNCTIONAL_SUITABILITY_VALUES)[number]) || biz === SUITABILITY_FILTER_EMPTY)) {
      partial.functionalSuitability = biz;
    }
    const timeClass = (qp[QP.timeClass] ?? '').trim();
    if (timeClass && (TIME_CLASSIFICATION_VALUES.includes(timeClass as (typeof TIME_CLASSIFICATION_VALUES)[number]) || timeClass === SUITABILITY_FILTER_EMPTY)) {
      partial.lxTimeClassification = timeClass;
    }
    const northStar = (qp[QP.northStar] ?? '').trim();
    if (northStar && (NORTH_STAR_CLASSIFICATION_VALUES.includes(northStar as (typeof NORTH_STAR_CLASSIFICATION_VALUES)[number]) || northStar === SUITABILITY_FILTER_EMPTY)) {
      partial.northStarClassification = northStar;
    }
    const bizCrit = (qp[QP.bizCrit] ?? '').trim();
    if (bizCrit && (CRITICALITY_VALUES.includes(bizCrit as (typeof CRITICALITY_VALUES)[number]) || bizCrit === SUITABILITY_FILTER_EMPTY)) {
      partial.businessCriticality = bizCrit;
    }
    const bizCap = (qp[QP.bizCap] ?? '').trim();
    if (bizCap) partial.relApplicationToBusinessCapability = bizCap;
    const bizCapMode = (qp[QP.bizCapMode] ?? '').trim();
    if (bizCapMode === 'exact') partial.relApplicationToBusinessCapabilityMode = 'exact';
    const userGroup = (qp[QP.userGroup] ?? '').trim();
    if (userGroup) partial.relApplicationToUserGroup = userGroup;
    const userGroupMode = (qp[QP.userGroupMode] ?? '').trim();
    if (userGroupMode === 'exact') partial.relApplicationToUserGroupMode = 'exact';
    const project = (qp[QP.project] ?? '').trim();
    if (project) partial.relApplicationToProject = project;
    const dataProduct = (qp[QP.dataProduct] ?? '').trim();
    if (dataProduct) partial.relApplicationToDataProduct = dataProduct;
    const tagsRaw = (qp[QP.tags] ?? '').trim();
    if (tagsRaw) partial.tags = tagsRaw.split(',').filter(Boolean);
    const tagGroupsRaw = (qp[QP.tagGroups] ?? '').trim();
    if (tagGroupsRaw) partial.tagGroups = tagGroupsRaw.split(',').filter(Boolean);
    const cfRaw = (qp[QP.customFields] ?? '').trim();
    if (cfRaw) {
      try {
        const parsed = JSON.parse(cfRaw);
        if (typeof parsed === 'object' && parsed != null) {
          partial.customFields = parsed as Record<string, string>;
        }
      } catch (e) { /* ignore parse error */ }
    }
    const cfIdsRaw = (qp[QP.customFieldIds] ?? '').trim();
    if (cfIdsRaw) partial.customFieldIds = cfIdsRaw.split(',').filter(Boolean);
    const pillsRaw = (qp[QP.pills] ?? '').trim();
    if (pillsRaw) partial.visiblePills = parseVisiblePills(pillsRaw.split(',').filter(Boolean));
    this.initialFilters.set(partial);
    this.currentFilters.set(emptyEntityListFilters());

    // Migration-specific filters (same concept: restored from the URL so they survive F5).
    const appSide = this.parseMultiFilter(qp[QP.appSide], this.APP_SIDE_OPTIONS);
    if (appSide) this.filterAppSide.set(appSide);
    const lifecycle = this.parseMultiFilter(qp[QP.lifecycle], MIGRATION_TARGET_LIFECYCLE_OPTIONS);
    if (lifecycle) this.filterLifecycle.set(lifecycle);
    const priority = this.parseMultiFilter(qp[QP.priority], MIGRATION_TARGET_PRIORITY_OPTIONS.map(String));
    if (priority) this.filterPriority.set(priority.map((p) => parseInt(p, 10)));
    const etaFrom = (qp[QP.etaFrom] ?? '').toString().trim();
    if (etaFrom && this.ETA_OPTIONS.includes(etaFrom)) this.filterEtaFrom.set(etaFrom);
    const etaTo = (qp[QP.etaTo] ?? '').toString().trim();
    if (etaTo && this.ETA_OPTIONS.includes(etaTo)) this.filterEtaTo.set(etaTo);
  }

  /** Format a date string to DD.MM.YYYY. */
  formatDate(iso: string | null): string {
    if (!iso) return '—';
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }

  /** Parse a DD.MM.YYYY or ISO date string to a Date object. */
  parseDate(dateStr: string | null): Date | null {
    if (!dateStr) return null;
    // Try ISO format first
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    }
    // Try DD.MM.YYYY
    const deMatch = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (deMatch) {
      return new Date(parseInt(deMatch[3]), parseInt(deMatch[2]) - 1, parseInt(deMatch[1]));
    }
    return null;
  }

  /** Convert a Date to ISO date string (YYYY-MM-DD). */
  toIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Handle start date change from date picker. */
  onStartDateChange(row: MigrationRow, value: Date | null): void {
    this.updateField(row, 'startDate', value ? this.toIsoDate(value) : null);
  }

  /** Handle end date change from date picker. */
  onEndDateChange(row: MigrationRow, value: Date | null): void {
    this.updateField(row, 'endDate', value ? this.toIsoDate(value) : null);
  }

  /** Build flattened migration rows from all applications.
   *  Preserves any local row that already exists (by uid) — this keeps in-flight edits
   *  visible when the cache is updated by a sibling app's PATCH success. Without this
   *  preservation, the row would be rebuilt from cache (which is still stale for any
   *  app whose own PATCH hasn't returned yet) and the user's edit would visually
   *  "revert".
   *
   *  The local-row read MUST stay inside untracked(): this method is called from the
   *  constructor `effect`, and tracking `rows()` there would create a feedback loop
   *  (effect → buildRows → rows.set → effect → …).
   */
  private buildRows(): void {
    const apps = this.applicationsService.applications();
    const localRowsByUid = untracked(() => {
      const m = new Map<string, MigrationRow>();
      for (const r of this.rows()) m.set(r.uid, r);
      return m;
    });

    const result: MigrationRow[] = [];

    for (const app of apps) {
      const targets = this.normalizeMigrationTarget(app.migrationTarget);
      for (const target of targets) {
        const uid = `${app.id}-${target.id}`;
        const local = localRowsByUid.get(uid);
        if (local) {
          result.push(local);
          continue;
        }
        result.push({
          uid,
          sourceAppId: app.id,
          sourceDisplayName: app.displayName,
          targetAppId: target.id,
          targetDisplayName: target.displayName,
          lifecycle: target.lifecycle ?? null,
          proportion: target.proportion ?? 100,
          priority: target.priority ?? null,
          effort: target.effort ?? null,
          benefit: target.benefit ?? null,
          eta: target.eta ?? null,
          startDate: target.startDate ?? null,
          endDate: target.endDate ?? null,
          projectReference: target.projectReference ?? null,
          comments: target.comments ?? null,
          userGroup: target.userGroup ?? null,
        });
      }
    }

    this.rows.set(result);
    this.loading.set(false);
  }

  /** Normalize migrationTarget from edges or flat array to MigrationTargetItem[]. */
  private normalizeMigrationTarget(raw: unknown): MigrationTargetItem[] {
    if (raw == null) return [];
    let items: any[];
    if (typeof raw === 'object' && !Array.isArray(raw) && raw !== null && 'edges' in raw) {
      items = Array.isArray((raw as any).edges) ? (raw as any).edges : [];
    } else if (Array.isArray(raw)) {
      items = raw;
    } else {
      return [];
    }

    const result: MigrationTargetItem[] = [];
    for (const item of items) {
      if (typeof item !== 'object' || item === null) continue;
      let fs: any;
      let edgeProps: any;
      if ('node' in item) {
        fs = item?.node?.factSheet ?? {};
        edgeProps = item;
      } else {
        fs = item;
        edgeProps = item;
      }
      const id = fs?.id ?? '';
      if (!id) continue;

      result.push({
        id: String(id),
        type: fs?.type ?? 'Application',
        displayName: fs?.displayName ?? String(id),
        lifecycle: edgeProps?.lifecycle ?? undefined,
        proportion: typeof edgeProps?.proportion === 'number' ? edgeProps.proportion : 100,
        priority: edgeProps?.priority ?? undefined,
        effort: edgeProps?.effort ?? undefined,
        benefit: edgeProps?.benefit ?? undefined,
        eta: edgeProps?.eta ?? undefined,
        startDate: edgeProps?.startDate ?? undefined,
        endDate: edgeProps?.endDate ?? undefined,
        projectReference: edgeProps?.projectReference ?? undefined,
        comments: edgeProps?.comments ?? undefined,
        userGroup: this.parseUserGroupEdges(edgeProps?.userGroup),
      });
    }
    return result;
  }

  /** Parse userGroup edges from either edges notation or flat array to a flat array. */
  private parseUserGroupEdges(ugRaw: unknown): Array<{ id: string; displayName: string; fullName?: string }> | null {
    if (!ugRaw) return null;
    let items: any[];
    if (typeof ugRaw === 'object' && !Array.isArray(ugRaw) && (ugRaw as any).edges && Array.isArray((ugRaw as any).edges)) {
      items = (ugRaw as any).edges;
    } else if (Array.isArray(ugRaw)) {
      items = ugRaw;
    } else {
      return null;
    }
    const result = items.map((u: any) => {
      const ufs = u?.node?.factSheet ?? u;
      return {
        id: String(ufs?.id ?? ''),
        displayName: String(ufs?.displayName ?? ufs?.fullName ?? ufs?.id ?? ''),
        fullName: ufs?.fullName != null ? String(ufs.fullName) : undefined,
      };
    }).filter((u: any) => u.id !== '');
    return result.length > 0 ? result : null;
  }

  /** Resolve a user group display name from the UserGroupsDataService cache, falling back to the provided label. */
  resolveUserGroupLabel(id: string, fallback: string): string {
    const all = this.userGroupsDataService.data();
    const ug = all.find((g) => g.id === id);
    return ug?.displayName ?? ug?.fullName ?? fallback;
  }

  /** Resolve a user group full name from the UserGroupsDataService cache, falling back to the provided label. */
  resolveUserGroupFullName(id: string, fallback: string): string {
    const all = this.userGroupsDataService.data();
    const ug = all.find((g) => g.id === id);
    return ug?.fullName ?? ug?.displayName ?? fallback;
  }

  /** Get the user groups already assigned to a source app (for the inline multi-select). */
  getAppUserGroups(sourceAppId: string): Array<{ id: string; displayName: string; fullName?: string }> {
    const app = this.applicationsService.applications().find((a) => a.id === sourceAppId);
    if (!app) return [];
    return readRelationItems(app.relApplicationToUserGroup).map((g) => ({
      id: g.id,
      displayName: this.resolveUserGroupLabel(g.id, g.displayName || g.fullName || g.id),
      fullName: this.resolveUserGroupFullName(g.id, g.fullName || g.displayName || g.id),
    }));
  }

  /** Check if a user group is selected on a migration row. */
  isMigrationUserGroupSelected(row: MigrationRow, ugId: string): boolean {
    return row.userGroup?.some((g) => g.id === ugId) ?? false;
  }

  /** Toggle a user group on/off for a migration row and trigger save. */
  toggleMigrationUserGroup(row: MigrationRow, ug: { id: string; displayName: string; fullName?: string }): void {
    const current = row.userGroup ?? [];
    const exists = current.some((g) => g.id === ug.id);
    const updated = exists ? current.filter((g) => g.id !== ug.id) : [...current, ug];
    row.userGroup = updated.length > 0 ? updated : null;
    this.rows.update((r) => [...r]);
    this.debouncedSaveSourceApp(row.sourceAppId);
  }

  /** Open migration target dialog for a specific source app and update the row data. */
  openMigrationTargetDialogForSourceApp(sourceAppId: string): void {
    const sourceRows = this.rows().filter((r) => r.sourceAppId === sourceAppId);
    if (sourceRows.length === 0) return;

    const currentSelection: MigrationTargetItem[] = sourceRows.map((r) => ({
      id: r.targetAppId,
      type: 'Application',
      displayName: r.targetDisplayName,
      lifecycle: r.lifecycle ?? undefined,
      proportion: r.proportion,
      priority: r.priority ?? undefined,
      effort: r.effort ?? undefined,
      benefit: r.benefit ?? undefined,
      eta: r.eta ?? undefined,
      startDate: r.startDate ?? undefined,
      endDate: r.endDate ?? undefined,
      projectReference: r.projectReference ?? undefined,
      comments: r.comments ?? undefined,
      userGroup: r.userGroup ?? undefined,
    }));

    const ref = this.dialog.open(MigrationTargetDialogComponent, {
      width: '80vw',
      maxWidth: '80vw',
      height: '80vh',
      maxHeight: '80vh',
      panelClass: 'migration-target-dialog-panel',
      data: { currentSelection, currentAppId: sourceAppId },
    });

    ref.afterClosed().subscribe((result: MigrationTargetItem[] | undefined) => {
      if (result == null) return;

      const allRows = this.rows();
      const otherRows = allRows.filter((r) => r.sourceAppId !== sourceAppId);
      const sourceApp = this.applicationsService.applications().find((a) => a.id === sourceAppId);
      const sourceDisplayName = sourceApp?.displayName ?? sourceAppId;

      const newSourceRows: MigrationRow[] = result.map((m) => ({
        uid: `${sourceAppId}-${m.id}`,
        sourceAppId,
        sourceDisplayName,
        targetAppId: m.id,
        targetDisplayName: m.displayName,
        lifecycle: m.lifecycle ?? null,
        proportion: m.proportion ?? 100,
        priority: m.priority ?? null,
        effort: m.effort ?? null,
        benefit: m.benefit ?? null,
        eta: m.eta ?? null,
        startDate: m.startDate ?? null,
        endDate: m.endDate ?? null,
        projectReference: m.projectReference ?? null,
        comments: m.comments ?? null,
        userGroup: m.userGroup ?? null,
      }));

      this.rows.set([...otherRows, ...newSourceRows]);
      this.debouncedSaveSourceApp(sourceAppId);
    });
  }

  /** Update a field on a migration row and debounced-save to API. */
  updateField(row: MigrationRow, field: keyof MigrationRow, value: any): void {
    (row as any)[field] = value;
    this.rows.update((r) => [...r]);
    this.debouncedSaveSourceApp(row.sourceAppId);
  }

  /** Debounced PATCH: rebuild migrationTarget for the source app and save. */
  private debouncedSaveSourceApp(sourceAppId: string): void {
    this.saveError.set(null);

    // Per-app debounce: only THIS app's timer is reset. Other apps' timers are
    // untouched, so an edit on app A never postpones a pending save on app B.
    const existingTimer = this.patchTimers.get(sourceAppId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    if (!this.pendingAppIds().has(sourceAppId)) {
      this.pendingAppIds.update((s) => {
        const next = new Set(s);
        next.add(sourceAppId);
        return next;
      });
    }

    const timer = setTimeout(() => {
      this.patchTimers.delete(sourceAppId);
      this.saveSourceAppMigrationTarget(sourceAppId);
    }, this.AUTOSAVE_DEBOUNCE_MS);

    this.patchTimers.set(sourceAppId, timer);
  }

  /** Build and send the PATCH for a source app's migrationTarget. */
  private saveSourceAppMigrationTarget(sourceAppId: string): void {
    const sourceRows = this.rows().filter((r) => r.sourceAppId === sourceAppId);
    // If all rows for this app were removed (e.g. via the migration target dialog),
    // there is nothing to save. Drop the pending flag so the indicator updates.
    if (sourceRows.length === 0) {
      this.pendingAppIds.update((s) => {
        const next = new Set(s);
        next.delete(sourceAppId);
        return next;
      });
      return;
    }

    const edges = sourceRows.map((r) => {
      const edge: Record<string, unknown> = {
        node: { factSheet: { id: r.targetAppId, type: 'Application', displayName: r.targetDisplayName } },
      };
      if (r.lifecycle != null && r.lifecycle !== '') edge['lifecycle'] = r.lifecycle;
      if (r.proportion != null) edge['proportion'] = r.proportion;
      if (r.priority != null) edge['priority'] = r.priority;
      if (r.effort != null && r.effort !== '') edge['effort'] = r.effort;
      if (r.benefit != null && r.benefit !== '') edge['benefit'] = r.benefit;
      if (r.eta != null && r.eta !== '') edge['eta'] = r.eta;
      if (r.startDate != null && r.startDate !== '') edge['startDate'] = r.startDate;
      if (r.endDate != null && r.endDate !== '') edge['endDate'] = r.endDate;
      if (r.projectReference != null && r.projectReference !== '') edge['projectReference'] = r.projectReference;
      if (r.comments != null && r.comments !== '') edge['comments'] = r.comments;
      if (Array.isArray(r.userGroup) && r.userGroup.length > 0) {
        edge['userGroup'] = {
          edges: r.userGroup.map((ug) => ({
            node: { factSheet: { id: ug.id, type: 'UserGroup', displayName: ug.displayName } },
          })),
        };
      }
      return edge;
    });

    const payload = { migrationTarget: { edges } };
    this.inflightSaves.update((n) => n + 1);
    this.entityApi.patchEntity(sourceAppId, payload, 'Application').subscribe({
      next: () => {
        // Re-read rows() at PATCH-completion time so the cache reflects the LATEST
        // local edits (the user may have edited again while this PATCH was in flight).
        // Using the `sourceRows` snapshot captured at PATCH-prep time would overwrite
        // newer edits with older data and visibly "revert" them on screen.
        const freshRows = this.rows().filter((r) => r.sourceAppId === sourceAppId);
        const targetItems = freshRows.map((r) => ({
          id: r.targetAppId,
          displayName: r.targetDisplayName,
          lifecycle: r.lifecycle,
          proportion: r.proportion,
          priority: r.priority,
          effort: r.effort,
          benefit: r.benefit,
          eta: r.eta,
          startDate: r.startDate,
          endDate: r.endDate,
          projectReference: r.projectReference,
          comments: r.comments,
          userGroup: r.userGroup,
        }));
        this.applicationsService.updateEntityPartial(sourceAppId, {
          migrationTarget: targetItems as any,
        });
        this.pendingAppIds.update((s) => {
          if (!s.has(sourceAppId)) return s;
          const next = new Set(s);
          next.delete(sourceAppId);
          return next;
        });
        this.inflightSaves.update((n) => Math.max(0, n - 1));
      },
      error: () => {
        this.inflightSaves.update((n) => Math.max(0, n - 1));
        // Keep the app in pendingAppIds so the indicator still shows it as needing save.
        const message = this.translate.instant('Save failed. Please try again.');
        this.saveError.set(message);
        const retryLabel = this.translate.instant('Retry');
        const ref = this.snackBar.open(message, retryLabel, {
          duration: 5000,
          panelClass: ['snackbar-error'],
        });
        ref.onAction().subscribe(() => this.saveSourceAppMigrationTarget(sourceAppId));
      },
    });
  }

  /** Export the currently displayed (filtered) migrations as an Excel file. */
  async onExport(): Promise<void> {
    const rows = this.sortedRows();
    if (rows.length === 0) return;
    this.snackBar.open('Download started…', '', { duration: 3000 });

    // `file-saver` doesn't have consistent ESM named exports across bundlers/prod builds.
    // In some builds `import('file-saver')` returns `{ saveAs }`, in others it returns the function as `default`.
    const [ExcelJSModule, FileSaverModule] = await Promise.all([import('exceljs'), import('file-saver')]);
    const ExcelJSDefault = ExcelJSModule.default;
    const saveAsFn = (FileSaverModule as any)?.saveAs ?? (FileSaverModule as any)?.default ?? FileSaverModule;
    if (typeof saveAsFn !== 'function') {
      console.error('file-saver saveAs export not found', FileSaverModule);
      return;
    }

    await this.exportMigrationsExcel(ExcelJSDefault, saveAsFn, rows);
  }

  private async exportMigrationsExcel(ExcelJSDefault: any, saveAsFn: any, rows: MigrationRow[]): Promise<void> {
    const baseUrl = window.location.origin;
    const useUgMatrix = this.userConfig.getExcelUserGroupMatrix();

    // Build leaf user groups for matrix mode
    let leafUserGroups: UserGroupItem[] = [];
    if (useUgMatrix) {
      const referencedIds = new Set<string>();
      for (const row of rows) {
        for (const g of row.userGroup ?? []) {
          if (g.id) referencedIds.add(g.id);
        }
      }
      this.userGroupsDataService.ensureLoaded();
      leafUserGroups = this.userGroupsDataService.getMatrixUserGroups(referencedIds);
    }

    const appLink = (appId: string, name: string): { text: string; hyperlink: string } => ({
      text: name,
      hyperlink: `${baseUrl}${this.userConfig.projectUrlString(`entity/Application/${appId}`)}`,
    });

    const columnSerializers: Record<string, { header: string; value: (row: MigrationRow) => string | number | { text: string; hyperlink: string } }> = {
      sourceDisplayName: {
        header: 'Source',
        value: (row) => appLink(row.sourceAppId, row.sourceDisplayName),
      },
      targetDisplayName: {
        header: 'Target',
        value: (row) => appLink(row.targetAppId, row.targetDisplayName),
      },
      lifecycle: {
        header: 'Lifecycle',
        value: (row) => row.lifecycle ?? '',
      },
      proportion: {
        header: 'Proportion',
        value: (row) => row.proportion ?? 100,
      },
      userGroup: {
        header: 'User Groups',
        value: (row) =>
          (row.userGroup ?? [])
            .map((g) => this.resolveUserGroupLabel(g.id, g.displayName || g.fullName || g.id))
            .filter(Boolean)
            .join('\n'),
      },
      priority: {
        header: 'Priority',
        value: (row) => row.priority ?? '',
      },
      effort: {
        header: 'Effort',
        value: (row) => row.effort ?? '',
      },
      benefit: {
        header: 'Benefit',
        value: (row) => row.benefit ?? '',
      },
      eta: {
        header: 'ETA',
        value: (row) => row.eta ?? '',
      },
      startDate: {
        header: 'Start',
        value: (row) => (row.startDate ? this.formatDate(row.startDate) : ''),
      },
      endDate: {
        header: 'End',
        value: (row) => (row.endDate ? this.formatDate(row.endDate) : ''),
      },
      projectReference: {
        header: 'Project Ref',
        value: (row) => row.projectReference ?? '',
      },
      comments: {
        header: 'Comments',
        value: (row) => row.comments ?? '',
      },
    };

    // All columns on this page are always visible (no column selector) — export in display order.
    const visibleColumns = Object.keys(columnSerializers);

    const wb = new ExcelJSDefault.Workbook();
    const ws = wb.addWorksheet('Migrations');

    // When matrix mode is on, replace the User Groups column with individual leaf-group columns
    const ugMatrixMode = useUgMatrix && leafUserGroups.length > 0;
    const matrixColCount = ugMatrixMode ? leafUserGroups.length : 0;

    const headerList: string[] = [];
    let ugStartIdx = -1; // 0-based index of the first user-group matrix column
    for (const c of visibleColumns) {
      if (ugMatrixMode && c === 'userGroup') {
        headerList.push('User Groups'); // leading banner column — group summary for the matrix
        ugStartIdx = headerList.length; // 0-based index of the first matrix column
        for (const ug of leafUserGroups) {
          headerList.push(ug.displayName);
        }
      } else {
        headerList.push(columnSerializers[c].header);
      }
    }
    const headers = headerList;

    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true };

    // Rotate user-group matrix column headers 90° left (text flows upward)
    if (ugStartIdx >= 0 && leafUserGroups.length > 0) {
      let maxHeadingLen = 0;
      // The banner column sits directly left of the matrix and titles the whole group.
      const bannerCell = headerRow.getCell(ugStartIdx); // 1-indexed
      bannerCell.alignment = { textRotation: 90, horizontal: 'left', vertical: 'bottom', wrapText: true };
      maxHeadingLen = 'User Groups'.length;
      ws.getColumn(ugStartIdx).width = 3;
      for (let i = 0; i < leafUserGroups.length; i++) {
        const cell = headerRow.getCell(ugStartIdx + i + 1); // 1-indexed
        cell.alignment = { textRotation: 90, horizontal: 'left', vertical: 'bottom', wrapText: true };
        cell.font = { bold: false }; // group names are not bold — only the banner is
        const hLen = leafUserGroups[i].displayName.length;
        if (hLen > maxHeadingLen) maxHeadingLen = hLen;
        ws.getColumn(ugStartIdx + i + 1).width = 3;
      }
      headerRow.height = maxHeadingLen * 1.5;
    }

    const leafIds = leafUserGroups.map((u) => u.id);
    const directMarkers = new Set<string>(); // "excelRow,colNum" for directly linked ● cells

    // Group matrix columns below their parent — Excel outline with the summary column on the left
    if (ugStartIdx >= 0 && leafUserGroups.length > 0) {
      ws.properties = { ...ws.properties, outlineProperties: { summaryBelow: false, summaryRight: false } };
      const ugLevels = this.userGroupsDataService.getMatrixOutlineLevels(leafIds);
      ws.getColumn(ugStartIdx).outlineLevel = 0; // banner column = group summary (left)
      leafUserGroups.forEach((ug, i) => {
        ws.getColumn(ugStartIdx + i + 1).outlineLevel = (ugLevels.get(ug.id) ?? 0) + 1;
      });
      // Open the matrix group collapsed: detail columns start out hidden behind
      // the banner and are expanded again with the outline +/- button.
      leafUserGroups.forEach((_ug, i) => {
        ws.getColumn(ugStartIdx + i + 1).hidden = true;
      });
    }

    let excelRowNum = 1; // header row
    rows.forEach((row) => {
      excelRowNum++;
      const values: (string | number | { text: string; hyperlink: string })[] = [];

      // Build a set of user group IDs assigned to this row
      const rowUgIds = new Set<string>();
      if (ugMatrixMode) {
        for (const g of row.userGroup ?? []) {
          if (g.id) rowUgIds.add(g.id);
        }
      }

      for (const colId of visibleColumns) {
        if (ugMatrixMode && colId === 'userGroup') {
          values.push(''); // banner column stays empty
          const ugMarks = this.userGroupsDataService.getMatrixRowMarks(leafUserGroups, rowUgIds);
          for (let i = 0; i < leafUserGroups.length; i++) {
            values.push(ugMarks[i]);
            if (ugMarks[i] === '●' && rowUgIds.has(leafUserGroups[i].id)) {
              directMarkers.add(`${excelRowNum},${ugStartIdx + i + 1}`);
            }
          }
        } else {
          values.push(columnSerializers[colId].value(row));
        }
      }
      ws.addRow(values);
    });

    const cellAlign: Partial<ExcelJS.Alignment> = { wrapText: true, vertical: 'top' };
    ws.eachRow((excelRow: any, rowNumber: number) => {
      if (rowNumber === 1) return; // skip header — rotation already set
      excelRow.alignment = cellAlign;
    });

    // Center ●/◐ markers in matrix columns and color them
    if (ugMatrixMode && ugStartIdx >= 0) {
      for (let i = 0; i < matrixColCount; i++) {
        ws.getColumn(ugStartIdx + i + 1).eachCell({ includeEmpty: false }, (cell: any, rowNumber: number) => {
          if (rowNumber > 1) {
            cell.alignment = { horizontal: 'center', vertical: 'top' };
            if (cell.value === '●' || cell.value === '◐') {
              const key = `${rowNumber},${ugStartIdx + i + 1}`;
              cell.font = {
                name: 'Segoe UI Symbol',
                color: directMarkers.has(key) ? { argb: 'FF000000' } : { argb: 'FF808080' },
              };
            }
          }
        });
      }
    }

    // Style hyperlink cells (Source / Target) as blue underlined links
    for (const colId of ['sourceDisplayName', 'targetDisplayName']) {
      const colIdx = headers.indexOf(columnSerializers[colId].header) + 1;
      if (colIdx <= 0) continue;
      ws.getColumn(colIdx).eachCell({ includeEmpty: false }, (cell: any, rowNumber: number) => {
        if (rowNumber > 1 && typeof cell.value === 'object' && cell.value && 'hyperlink' in cell.value) {
          cell.font = { color: { argb: 'FF0563C1' }, underline: true };
        }
      });
    }

    // Proportion column: show as percentage
    const proportionColIdx = headers.indexOf('Proportion') + 1;
    if (proportionColIdx > 0) {
      ws.getColumn(proportionColIdx).eachCell({ includeEmpty: false }, (cell: any, rowNumber: number) => {
        if (rowNumber > 1 && typeof cell.value === 'number') {
          cell.numFmt = '0"%"';
        }
      });
    }

    const CHAR_WIDTH = 1.2;
    const MIN_COL_WIDTH = 8;
    const MAX_COL_WIDTH = 60;
    const ugMatrixColIndices = new Set<number>();
    if (ugMatrixMode && ugStartIdx >= 0) {
      ugMatrixColIndices.add(ugStartIdx); // banner column
      for (let i = 0; i < matrixColCount; i++) ugMatrixColIndices.add(ugStartIdx + i + 1);
    }
    ws.columns.forEach((col: any, _idx: number) => {
      if (ugMatrixColIndices.has(col.number)) return;
      let maxLen = MIN_COL_WIDTH;
      col.eachCell!({ includeEmpty: false }, (cell: any) => {
        const text = cell.value != null ? String(typeof cell.value === 'object' && 'text' in cell.value ? cell.value.text : cell.value) : '';
        const lines = text.split('\n');
        const longest = lines.reduce((max: number, line: string) => Math.max(max, line.length), 0);
        if (longest > maxLen) maxLen = longest;
      });
      col.width = Math.min(maxLen * CHAR_WIDTH, MAX_COL_WIDTH);
    });

    const buffer = await wb.xlsx.writeBuffer();
    saveAsFn(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      'migrations.xlsx'
    );
  }
}
