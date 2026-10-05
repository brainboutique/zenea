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

import { Component, signal, computed, inject, OnInit, OnDestroy, ChangeDetectorRef, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
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
import { EntityListFilters, emptyEntityListFilters } from '../../models/entity-list-filters';
import { SUITABILITY_VALUES } from '../../components/suitability-rating/suitability-rating.component';
import { TIME_CLASSIFICATION_VALUES } from '../../components/time-classification/time-classification.component';
import { NORTH_STAR_CLASSIFICATION_VALUES } from '../../components/north-star-classification/north-star-classification.component';
import { CRITICALITY_VALUES } from '../../components/suitability-rating/suitability-rating.component';
import { UserGroupPillComponent } from '../../components/user-group-pill/user-group-pill.component';
import { UserGroupsDataService, UserGroupItem } from '../../services/UserGroupsDataService';
import { MigrationTargetDialogComponent } from '../../components/migration-target-dialog/migration-target-dialog.component';
import { HoverInfoOverlayService } from '../../services/hover-info-overlay.service';
import { readRelationItems } from '../../utils/relation-data';

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
} as const;

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
    MatProgressSpinnerModule,
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
export class MigrationsListComponent implements OnInit, OnDestroy {
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
  filterLifecycle = signal<string[]>([...MIGRATION_TARGET_LIFECYCLE_OPTIONS.filter((lc) => lc !== 'Done' && lc !== 'Discarded')]);
  filterPriority = signal<number | null>(null);
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

  /** Rows filtered by lifecycle and app-level filters only (for grid counts). */
  lifecycleFilteredRows = computed(() => {
    let data = this.rows();
    const lc = this.filterLifecycle();
    if (lc.length > 0) data = data.filter((r) => r.lifecycle != null && lc.includes(r.lifecycle));

    const filters = this.currentFilters();
    if (filters.name) {
      const nameLower = filters.name.toLowerCase();
      const tokens = nameLower.split(/\s+/).filter(Boolean);
      data = data.filter((r) => {
        const haystack = `${r.sourceDisplayName} ${r.targetDisplayName}`.toLowerCase();
        return tokens.every((t) => haystack.includes(t));
      });
    }

    const hasNonNameAppFilters = filters.status !== 'ACTIVE' ||
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
    const pr = this.filterPriority();
    const ef = this.filterEffort();
    const bn = this.filterBenefit();
    const ge = this.gridFilterEffort();
    const gb = this.gridFilterBenefit();
    if (lc.length > 0) data = data.filter((r) => r.lifecycle != null && lc.includes(r.lifecycle));
    if (pr != null) data = data.filter((r) => r.priority === pr);
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
    const hasNonNameAppFilters = filters.status !== 'ACTIVE' ||
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
  setFilter(column: 'priority' | 'effort' | 'benefit', value: any): void {
    switch (column) {
      case 'priority':
        this.filterPriority.set(this.filterPriority() === value ? null : value);
        break;
      case 'effort':
        this.filterEffort.set(this.filterEffort() === value ? null : value);
        break;
      case 'benefit':
        this.filterBenefit.set(this.filterBenefit() === value ? null : value);
        break;
    }
  }

  /** Check if a filter is active. */
  isFilterActive(column: 'priority' | 'effort' | 'benefit', value: any): boolean {
    switch (column) {
      case 'priority': return this.filterPriority() === value;
      case 'effort': return this.filterEffort() === value;
      case 'benefit': return this.filterBenefit() === value;
    }
  }

  /** Check if any column filter is active. */
  hasActiveFilter(): boolean {
    return this.filterPriority() != null || this.filterEffort() != null || this.filterBenefit() != null
      || this.gridFilterEffort() != null || this.gridFilterBenefit() != null
      || this.filterLifecycle().length < MIGRATION_TARGET_LIFECYCLE_OPTIONS.length;
  }

  /** Clear all column filters. */
  clearFilters(): void {
    this.filterLifecycle.set([...MIGRATION_TARGET_LIFECYCLE_OPTIONS]);
    this.filterPriority.set(null);
    this.filterEffort.set(null);
    this.filterBenefit.set(null);
    this.gridFilterEffort.set(null);
    this.gridFilterBenefit.set(null);
  }

  /** Toggle a lifecycle value in the multi-select filter. */
  toggleLifecycleFilter(value: string): void {
    this.filterLifecycle.update((prev) => {
      if (prev.includes(value)) {
        return prev.filter((v) => v !== value);
      }
      return [...prev, value];
    });
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
      [QP.status]: filters.status !== 'ACTIVE' ? filters.status : null,
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
    if (status && (status === 'ACTIVE' || status === 'ARCHIVED')) {
      partial.status = status;
    }
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
      displayName: g.displayName,
      fullName: g.fullName,
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
}
