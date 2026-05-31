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

import { Component, signal, ViewChild, ElementRef, AfterViewInit, inject, OnInit, input, OnDestroy, DestroyRef, computed, effect } from '@angular/core';
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
import { MatDialogModule } from '@angular/material/dialog';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { ColumnSelectorDialogComponent, ColumnSelectorItem, ColumnSelectorResult } from './column-selector-dialog.component';
import { TimeClassificationComponent } from '../../components/time-classification/time-classification.component';
import { NorthStarClassificationComponent, NORTH_STAR_CLASSIFICATION_VALUES } from '../../components/north-star-classification/north-star-classification.component';
import { EditFieldComponent, EditFieldData, EditFieldType } from '../../components/edit-field/edit-field.component';
import { MatTableModule } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';

import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ListFiltersComponent, SUITABILITY_FILTER_EMPTY } from '../../components/list-filters/list-filters.component';
import { TranslateModule } from '@ngx-translate/core';
import { SUITABILITY_VALUES } from '../../components/suitability-rating/suitability-rating.component';
import { TIME_CLASSIFICATION_VALUES } from '../../components/time-classification/time-classification.component';
import { CRITICALITY_VALUES } from '../../components/suitability-rating/suitability-rating.component';
import { PLATFORM_TEMP_VALUES } from '../../models/platform-temp-values';
import { ApplicationsService, ApplicationItem } from '../../services/ApplicationsService';
import { ServiceCatalogService } from '../../services/ServiceCatalogService';
import { UserConfigService } from '../../services/user-config.service';
import { stackApplications, StackableApplicationItem, computeDisplayNameStacked } from '../../utils/application-stacker';
import { AuthorizationService } from '../../services/authorization.service';
import { MigrationTargetDialogComponent } from '../../components/migration-target-dialog/migration-target-dialog.component';
import { MigrationTargetItem } from '../../models/migration-target-item';
import { AlternativesDialogComponent } from '../../components/alternatives-dialog/alternatives-dialog.component';
import { AlternativeItem } from '../../models/alternative-item';
import { ReferenceEditorDialogComponent } from '../../components/reference-editor-dialog/reference-editor-dialog.component';
import type { ReferenceEditorItem, ReferenceTargetType, ReferenceEditorDialogData } from '../../models/reference-editor-item';
import { ModelDefinitionsService, CustomFieldDefinition } from '../../services/model-definitions.service';
import { PageTitleService } from '../../services/page-title.service';
import { GitHistoryDialogComponent } from '../../components/git-history-dialog/git-history-dialog.component';
import { RegionMapWidgetComponent } from '../../components/region-map-widget/region-map-widget.component';
import { UserGroupsDataService } from '../../services/UserGroupsDataService';
import type ExcelJS from 'exceljs';

interface CatalogTreeNode {
  id: string;
  displayName: string;
  description?: string;
  abstract?: boolean;
  depth: number;
}

interface CatalogNodeState {
  loaded: boolean;
  loading: boolean;
  children: CatalogTreeNode[];
  applications: { id: string; displayName: string }[];
  services: { id: string; displayName: string; description?: string }[];
}

type CatalogRow =
  | { type: 'catalog-item'; uid: string; node: CatalogTreeNode; state: CatalogNodeState }
  | { type: 'catalog-app'; uid: string; appId: string; appDisplayName: string; depth: number; entity: ListEntities200ResponseInner | null }
  | { type: 'catalog-service'; uid: string; serviceId: string; serviceDisplayName: string; serviceDescription?: string; depth: number };

type TableListRow =
  | { rowKind: 'catalog-item'; uid: string; node: CatalogTreeNode; state: CatalogNodeState }
  | { rowKind: 'application'; uid: string; entity: ListEntities200ResponseInner; stackedCount?: number }
  | { rowKind: 'catalog-app'; uid: string; appId: string; appDisplayName: string; depth: number; entity: null }
  | { rowKind: 'catalog-service'; uid: string; serviceId: string; serviceDisplayName: string; serviceDescription?: string; depth: number };

interface PdfAppInfo {
  id: string;
  displayName: string;
  entity: ListEntities200ResponseInner | null;
}

interface PdfServiceInfo {
  id: string;
  displayName: string;
  description?: string;
}

interface PdfCatalogItem {
  displayName: string;
  description: string;
  depth: number;
  number: string;
  businessCapabilities: string[];
  applications: PdfAppInfo[];
  services: PdfServiceInfo[];
}

/** LocalStorage key for list column visibility */
const LIST_COLUMN_VISIBILITY_KEY = 'zenea.list.columnVisibility';

/** LocalStorage key for list column order */
const LIST_COLUMN_ORDER_KEY = 'zenea.list.columnOrder';

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
    // Also include any custom columns from parsed data
    if (typeof parsed === 'object' && parsed != null) {
      Object.keys(parsed).forEach((key) => {
        if (!result[key] && typeof parsed[key] === 'object' && parsed[key] != null && 'visibility' in (parsed[key] as object)) {
          const entry = parsed[key] as { visibility: unknown };
          if (typeof entry.visibility === 'boolean') {
            result[key] = { visibility: entry.visibility };
          }
        }
      });
    }
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

/** Load column order from localStorage, filtering out stale IDs. */
function loadColumnOrder(currentIds: string[]): string[] {
  try {
    const raw = localStorage.getItem(LIST_COLUMN_ORDER_KEY);
    if (!raw) return currentIds;
    const stored = JSON.parse(raw) as string[];
    if (!Array.isArray(stored)) return currentIds;
    const idSet = new Set(currentIds);
    const valid = stored.filter(id => idSet.has(id));
    const validSet = new Set(valid);
    const added = currentIds.filter(id => !validSet.has(id));
    return [...valid, ...added];
  } catch {
    return currentIds;
  }
}

function saveColumnOrder(order: string[]): void {
  try {
    localStorage.setItem(LIST_COLUMN_ORDER_KEY, JSON.stringify(order));
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
  tags: 'tags',
  tagGroups: 'tagGroups',
  customFields: 'cf',
  customFieldIds: 'cfIds',
  view: 'view',
  northStar: 'northStar',
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
    NorthStarClassificationComponent,
    EditFieldComponent,
    ListFiltersComponent,
    MatCheckboxModule,
    MatDialogModule,
    DragDropModule,
    TranslateModule,
    RegionMapWidgetComponent,
  ],
  templateUrl: './list.component.html',
  styleUrl: './list.component.scss',
})
export class ApplicationListComponent implements AfterViewInit, OnInit, OnDestroy {
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild('tableContainer', { read: ElementRef }) private tableContainer!: ElementRef<HTMLElement>;

  /** Row height in pixels for virtual scroll calculations. */
  private readonly ROW_HEIGHT = 52;

  /** Number of extra rows to render above/below the viewport for smooth scrolling. */
  private readonly BUFFER_ROWS = 10;

  /** Current scroll offset in pixels. */
  private scrollTop = signal(0);

  /** Visible rows computed from scroll position for lightweight virtual scrolling. */
  readonly virtualRows = computed(() => {
    const allRows = this.unifiedTableData();
    if (allRows.length === 0) {
      return { visibleRows: [] as TableListRow[], topHeight: 0, bottomHeight: 0, totalHeight: 0 };
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

  /** When 'compact', suitability ratings show only stars (no label, read-only). */
  mode = input<'compact' | 'default'>('default');

  private entityService = inject(EntityApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private pageTitleService = inject(PageTitleService);
  private refreshService = inject(EntityListRefreshService);
  private facetsService = inject(FacetsService);
  applicationsService = inject(ApplicationsService);
  private serviceCatalogService = inject(ServiceCatalogService);
  private destroyRef = inject(DestroyRef);
  userConfig = inject(UserConfigService);
  private authorization = inject(AuthorizationService);
  private modelDefinitionsService = inject(ModelDefinitionsService);
  private userGroupsDataService = inject(UserGroupsDataService);

  /** Custom field definitions loaded from API (Application entity). */
  customFields = signal<Record<string, CustomFieldDefinition>>({});

  readonly canEdit = this.authorization.canEdit;
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  /** Whether a given table row can be edited (requires canEdit and not a stacked app). */
  canEditRow(row: TableListRow): boolean {
    return this.canEdit() && !this.isStackedApplication(row);
  }

  /** When true, blur application name, migration target and user group in list (Settings). */
  hideSensitive = this.userConfig.hideSensitiveInformation$;
  /** When true, stack applications with same base name (Settings). */
  stackAppsEnabled = this.userConfig.stackApplications$;
  private readonly PATCH_DEBOUNCE_MS = 400;
  private pendingPatches = new Map<string, Record<string, unknown>>();
  private patchTimers = new Map<string, any>();

  /** Last filters used for client-side filtering. */
  private currentFilters = signal<EntityListFilters>(emptyEntityListFilters());

  /** Whether the region map widget is collapsed (persisted in localStorage). */
  mapCollapsed = signal(this.readMapCollapsed());

  private readMapCollapsed(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem('zen-map-collapsed') === 'true';
  }

  toggleMap(): void {
    const next = !this.mapCollapsed();
    this.mapCollapsed.set(next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('zen-map-collapsed', String(next));
    }
  }

  /** Initial filter values from URL, passed to app-list-filters once. */
  initialFilters = signal<Partial<EntityListFilters>>({});

  /** Filtered entities computed from cached applications + current filters (client-side only). */
  filteredEntities = computed(() => {
    const apps = this.applicationsService.applications();
    const filters = this.currentFilters();
    let result: ApplicationItem[] = [];
    if (!this.serviceCatalogView() && apps.length > 0) {
      result = this.applicationsService.applyFilters({
        name: filters.name,
        technicalSuitability: filters.technicalSuitability,
        functionalSuitability: filters.functionalSuitability,
        lxTimeClassification: filters.lxTimeClassification,
        northStarClassification: filters.northStarClassification,
        businessCriticality: filters.businessCriticality,
        relApplicationToBusinessCapability: filters.relApplicationToBusinessCapability,
        relApplicationToUserGroup: filters.relApplicationToUserGroup,
        relApplicationToProject: filters.relApplicationToProject,
        relApplicationToDataProduct: filters.relApplicationToDataProduct,
        platformTEMP: filters.platformTEMP,
        tags: filters.tags,
        customFields: filters.customFields,
      });
    }
    if (this.stackAppsEnabled() && result.length > 0) {
      return stackApplications(result) as ApplicationItem[];
    }
    return result;
  });

  private _catalogRowsBuilt = false;
  /** Snapshot of cached app IDs to detect when apps load after catalog. */
  private _lastCachedAppIds = '';

  private _applicationsEffect = effect(() => {
    const apps = this.applicationsService.applications();
    const catalogItems = this.serviceCatalogService.items();
    const appLoading = this.applicationsService.loading();
    const catalogLoading = this.serviceCatalogService.loading();
    const isCatalog = this.serviceCatalogView();

    if (isCatalog) {
      if (catalogLoading) {
        this.loading.set(true);
        this._catalogRowsBuilt = false;
        this._lastCachedAppIds = '';
        this.unifiedTableData.set([]);
        this.displayedCount.set(0);
        return;
      }
      if (catalogItems.length === 0) {
        this.loading.set(false);
        this._catalogRowsBuilt = true;
        this._lastCachedAppIds = '';
        this.unifiedTableData.set([]);
        this.displayedCount.set(0);
        return;
      }
      if (!this._catalogRowsBuilt) {
        this._catalogRowsBuilt = true;
        this.loadServiceCatalogRoot();
      } else if (!appLoading && apps.length > 0) {
        const currentIds = apps.map(a => a.id).sort().join(',');
        if (currentIds !== this._lastCachedAppIds) {
          this._lastCachedAppIds = currentIds;
          this.rebuildCatalogRows();
        }
      }
    } else {
      this._catalogRowsBuilt = false;
      if (appLoading) {
        this.loading.set(true);
        return;
      }
      if (apps.length > 0) {
        this.applyFiltersToTable();
      }
    }
  });

  /** All entities from last API load (kept for backward compat with any direct usages). */
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

  /** Columns that should NOT grow when table is wider than content. */
  private readonly FIXED_WIDTH_COLUMNS = new Set([
    'lxTimeClassification',
    'functionalSuitability',
    'technicalSuitability',
  ]);

  isFixedWidthColumn(colId: string): boolean {
    return this.FIXED_WIDTH_COLUMNS.has(colId);
  }

  /** Query param "view=ServiceCatalog" enables catalog tree overlay on application list. */
  serviceCatalogView = signal(false);

  /** Root catalog items loaded from API. */
  private catalogRootItems = signal<ListEntities200ResponseInner[]>([]);

  /** State map for expanded catalog nodes (id -> loaded state). */
  private catalogNodeState = signal<Map<string, CatalogNodeState>>(new Map());

  /** Path of catalog node IDs from root to last expanded node (| separated). */
  private catalogBreadcrumbs = signal<string>('');

  /** Whether at least one catalog node is expanded and has at least one app. */
  readonly anyCatalogNodeLoaded = computed(() => {
    for (const [, state] of this.catalogNodeState()) {
      if (state.loaded && state.applications.length > 0) return true;
    }
    return false;
  });

  /** Flat list of catalog rows (catalog items + their referenced applications). */
  catalogRows = signal<CatalogRow[]>([]);

  /** Flat list of rows for the unified table (catalog items + applications). */
  tableRows = signal<TableListRow[]>([]);

  /** Cache of loaded application entities for catalog app rows, populated from ApplicationsService. */
  private catalogAppEntityCache = new Map<string, ListEntities200ResponseInner>();

  /** Per-computation cache for catalogNodeHasMatchingContent (cleared in buildTableRowsFromCatalog). */
  private _matchingContentCache = new Map<string, boolean>();

  /** Guard to prevent re-entrant auto-expand when buildTableRowsFromCatalog is called recursively. */
  private _autoExpandDone = false;

  /** IDs of catalog nodes that were expanded by auto-expand (to collapse on filter clear). */
  private _autoExpandedNodeIds = new Set<string>();

  /** Breadcrumbs saved before auto-expand (restored on collapse). */
  private _preAutoExpandBreadcrumbs = '';

  /** Populate the app entity cache from already-loaded ApplicationsService data. */
  private populateCatalogAppEntityCache(): void {
    this.catalogAppEntityCache.clear();
    const apps = this.applicationsService.applications();
    for (const app of apps) {
      this.catalogAppEntityCache.set(app.id, this.applicationItemToEntity(app));
    }
    this._lastCachedAppIds = apps.map(a => a.id).sort().join(',');
  }

  /** Number of items currently displayed (after client-side name filter). Used for empty-state message. */
  displayedCount = signal(0);

  /** Unified data source for the table (works for both catalog and normal view). */
  unifiedTableData = signal<TableListRow[]>([]);

  /** Number of application rows currently displayed in table (includes expanded/unstacked rows). */
  displayedAppsCount = computed(() => this.unifiedTableData().filter((row) => row.rowKind === 'application').length);

  /** Applications currently visible on screen, used by the region map widget for highlighting. */
  visibleApplicationsForMap = computed(() => {
    if (this.serviceCatalogView()) {
      return this.unifiedTableData()
        .filter((row): row is { rowKind: 'application'; uid: string; entity: ListEntities200ResponseInner; stackedCount?: number } => row.rowKind === 'application')
        .map((row) => this.entityToApplicationItem(row.entity));
    }
    return this.filteredEntities();
  });

  /** Number of applications matching current filters before any stacking is applied. */
  fullAppsCountBeforeStacking = computed(() => {
    if (this.serviceCatalogView()) {
      return this.displayedAppsCount();
    }
    const filters = this.currentFilters();
    return this.applicationsService.applyFilters({
      name: filters.name,
      technicalSuitability: filters.technicalSuitability,
      functionalSuitability: filters.functionalSuitability,
      lxTimeClassification: filters.lxTimeClassification,
      northStarClassification: filters.northStarClassification,
      businessCriticality: filters.businessCriticality,
      relApplicationToBusinessCapability: filters.relApplicationToBusinessCapability,
      relApplicationToUserGroup: filters.relApplicationToUserGroup,
      relApplicationToProject: filters.relApplicationToProject,
      relApplicationToDataProduct: filters.relApplicationToDataProduct,
      platformTEMP: filters.platformTEMP,
      tags: filters.tags,
      customFields: filters.customFields,
    }).length;
  });

  /** Whether at least one stacked pseudo-row is currently visible. */
  hasStackedAppsDisplayed = computed(() =>
    this.unifiedTableData().some((row) => this.isStackedApplication(row))
  );

  /** Visibility state: { [columnId]: { visibility: boolean } }. Loaded from localStorage on init. */
  columnVisibility = signal<ColumnVisibility>(defaultColumnVisibility());

  /** User-defined column display order (persisted). Built from current columns + localStorage. */
  columnOrder = signal<string[]>([]);

  /** Column meta for the selector menu (id + label), including custom fields, in user-defined order. */
  readonly columnMeta = computed(() => {
    const staticCols = TOGGLEABLE_COLUMNS;
    const customFields = this.customFields();
    const customCols = Object.entries(customFields).map(([key, def]) => ({
      id: key,
      label: (def.label?.['en'] ?? def.label?.[Object.keys(def.label)[0]]) ?? key,
    }));
    const all = [...staticCols.map(c => c.id), ...customCols.map(c => c.id)];
    // Establish signal dependency — triggers recompute when order changes
    const signalOrder = this.columnOrder();
    const baseOrder = signalOrder.length > 0 ? signalOrder : loadColumnOrder(all);
    const baseSet = new Set(baseOrder);
    const remaining = all.filter(id => !baseSet.has(id));
    const fullOrder = [...baseOrder.filter(id => all.includes(id)), ...remaining];
    const byId = new Map<string, string>();
    for (const c of staticCols) byId.set(c.id, c.label);
    for (const c of customCols) byId.set(c.id, c.label);
    return fullOrder.filter(id => byId.has(id)).map(id => ({ id, label: byId.get(id)! }));
  });

  /** Open the column selector dialog with drag-drop reordering. */
  openColumnSelector(): void {
    const columns: ColumnSelectorItem[] = this.columnMeta().map(c => ({
      id: c.id,
      label: c.label,
      visible: this.columnVisibility()[c.id]?.visibility !== false,
    }));
    const ref = this.dialog.open(ColumnSelectorDialogComponent, {
      data: { columns },
      panelClass: 'column-selector-dialog',
    });
    ref.afterClosed().subscribe((result: ColumnSelectorResult | undefined) => {
      if (!result) return;
      this.columnOrder.set(result.order);
      this.columnVisibility.set(result.visibility);
      saveColumnOrder(result.order);
      saveColumnVisibility(result.visibility);
    });
  }

  /** Toggle visibility for a column and persist to localStorage. */
  toggleColumnVisibility(columnId: string): void {
    const next = { ...this.columnVisibility() };
    const entry = next[columnId];
    next[columnId] = { visibility: entry ? !entry.visibility : false };
    this.columnVisibility.set(next);
    saveColumnVisibility(next);
  }

  /** Ensure columnVisibility has an entry for every column in columnMeta. */
  private ensureColumnVisibility(): void {
    const meta = this.columnMeta();
    const vis = { ...this.columnVisibility() };
    let changed = false;
    meta.forEach((col) => {
      if (!vis[col.id]) {
        vis[col.id] = { visibility: true };
        changed = true;
      }
    });
    if (changed) {
      this.columnVisibility.set(vis);
      saveColumnVisibility(vis);
    }
  }

  /** Displayed column ids (computed from columnVisibility; actions always present). */
  get displayedColumns(): string[] {
    const vis = this.columnVisibility();
    const allToggleable = this.columnMeta();
    const visibleToggleable = allToggleable.filter((c) => vis[c.id]?.visibility !== false).map((c) => c.id);
    return [...visibleToggleable, 'actions'];
  }

  /** Total number of columns in the table (for colspan). */
  get columnCount(): number {
    return (this.serviceCatalogView() ? 1 : 0) + 3 + this.displayedColumns.length;
  }

  /** Check if a column id is a custom field (not in TOGGLEABLE_COLUMNS). */
  isCustomField(columnId: string): boolean {
    return !TOGGLEABLE_COLUMNS.some((c) => c.id === columnId);
  }

  /** Get custom field definition by key. */
  getCustomFieldDef(columnId: string): CustomFieldDefinition | undefined {
    return this.customFields()[columnId];
  }

  /** Get the edit-field type for a custom field. */
  getCustomFieldType(columnId: string): EditFieldType {
    const def = this.getCustomFieldDef(columnId);
    if (!def) return 'text';
    switch (def.type) {
      case 'number': return 'number';
      case 'textarea': return 'textarea';
      case 'selectSingle': return 'selectSingle';
      case 'selectMultiple': return 'selectMultiple';
      default: return 'text';
    }
  }

  /** Cast row entity to EditFieldData for template binding. */
  asEditFieldData(entity: ListEntities200ResponseInner): EditFieldData {
    return entity as unknown as EditFieldData;
  }

  /** Get the label for a custom field column. */
  getCustomFieldLabel(columnId: string): string {
    const def = this.getCustomFieldDef(columnId);
    if (!def) return columnId;
    return def.label?.['en'] ?? def.label?.[Object.keys(def.label)[0]] ?? columnId;
  }

  /** Get options for a select-type custom field. */
  getCustomFieldOptions(columnId: string): string[] {
    const def = this.getCustomFieldDef(columnId);
    return def?.values ?? [];
  }

  /** Get UoM for a custom field. */
  getCustomFieldUom(columnId: string): string {
    const def = this.getCustomFieldDef(columnId);
    return def?.uom ?? '';
  }

  /** Get callback for patching a custom field value. */
  getOnCustomFieldMutated(row: ListEntities200ResponseInner, columnId: string): () => void {
    return () => this.patchEntityField(row.id!, { [columnId]: row[columnId as keyof typeof row] });
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

  /** Callback for north star classification change: PATCH entity with northStarClassification. */
  getOnNorthStarMutated(row: ListEntities200ResponseInner): () => void {
    return () => this.patchEntityField(row.id!, { northStarClassification: row.northStarClassification ?? null });
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

    this.applicationsService.ensureLoaded();
    this.serviceCatalogService.ensureLoaded();
    this.userGroupsDataService.ensureLoaded();

    // Load custom field definitions for Application entity
    this.modelDefinitionsService.getModelDefinitions().subscribe({
      next: (definitions) => {
        const appDef = definitions['Application'];
        if (appDef?.customFields) {
          this.customFields.set(appDef.customFields);
          // Ensure columnVisibility has entries for all columns (including custom fields)
          this.ensureColumnVisibility();
        }
      },
      error: () => this.customFields.set({}),
    });

    this.refreshService.onRefresh.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event === 'show-loading') {
        this.showLoadingState();
      } else {
        this.facetsService.load();
        this.applicationsService.invalidateMigrationTargetOptionsCache();
        this.serviceCatalogService.invalidateCache();
      }
    });
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((qp) => {
      const view = (qp[QP.view] ?? '').trim();
      const isCatalogView = view === 'ServiceCatalog';
      if (isCatalogView !== this.serviceCatalogView()) {
        this.serviceCatalogView.set(isCatalogView);
      }
    });
    const qp = this.route.snapshot.queryParams;
    const view = (qp[QP.view] ?? '').trim();
    this.serviceCatalogView.set(view === 'ServiceCatalog');
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
    const userGroup = (qp[QP.userGroup] ?? '').trim();
    if (userGroup) partial.relApplicationToUserGroup = userGroup;
    const project = (qp[QP.project] ?? '').trim();
    if (project) partial.relApplicationToProject = project;
    const dataProduct = (qp[QP.dataProduct] ?? '').trim();
    if (dataProduct) partial.relApplicationToDataProduct = dataProduct;
    const platformTEMP = (qp[QP.platformTEMP] ?? '').trim();
    if (platformTEMP) partial.platformTEMP = platformTEMP;
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
    this.initialFilters.set(partial);
  }

  ngAfterViewInit(): void {
    this.tableContainer?.nativeElement && this.onTableScroll({ target: this.tableContainer.nativeElement } as unknown as Event);
  }

  onTableScroll(event: Event): void {
    const target = event.target as HTMLElement;
    if (target) {
      this.scrollTop.set(target.scrollTop);
    }
  }

  ngOnDestroy(): void {
    this.pageTitleService.clearTitle();
    this.patchTimers.forEach((t) => clearTimeout(t));
    this.patchTimers.clear();
    this.pendingPatches.clear();
  }

  // -- Service Catalog View --

  /** Load root ServiceCatalogSections and build initial catalog rows from cached data. */
  private loadServiceCatalogRoot(): void {
    const items = this.serviceCatalogService.items();
    if (items.length === 0) {
      this.loading.set(true);
      return;
    }
    this.catalogRootItems.set(this.serviceCatalogService.rootItems());
    this.restoreBreadcrumbs();
    this.buildCatalogRowsFromRoot();
    this.loading.set(false);
  }

  /** Restore expanded state from the `breadcrumbs` query param by sequentially loading nodes. */
  private restoreBreadcrumbs(): void {
    const breadcrumbs = this.route.snapshot.queryParams['breadcrumbs'] ?? '';
    if (!breadcrumbs) return;
    const ids = breadcrumbs.split('|').filter(Boolean);
    if (ids.length === 0) return;
    this.catalogBreadcrumbs.set(breadcrumbs);
    this.restoreBreadcrumbsPath(ids);
  }

  /** Recursively expand nodes along a path, loading applications from API but children from cache. */
  private restoreBreadcrumbsPath(ids: string[], index = 0): void {
    if (index >= ids.length) return;
    const targetId = ids[index];

    const existingState = this.catalogNodeState().get(targetId);
    if (existingState?.loaded) {
      this.restoreBreadcrumbsPath(ids, index + 1);
      return;
    }

    this.catalogNodeState.update((state) => {
      const next = new Map(state);
      next.set(targetId, { loaded: false, loading: true, children: [], applications: [], services: [] });
      return next;
    });
    this.rebuildCatalogRows();

    const children: CatalogTreeNode[] = this.serviceCatalogService.getItemsByParent(targetId).map((item) => ({
      id: item.id ?? '',
      displayName: item.displayName ?? '',
      description: item.description ?? undefined,
      abstract: (item as any)['abstract'] ?? false,
      depth: index + 1,
    }));

    this.entityService.getServiceCatalogSection(targetId).subscribe({
      next: (fullItem: any) => {
        const applications: { id: string; displayName: string }[] = [];
        const appsData = fullItem?.applications;
        if (appsData?.edges) {
          for (const edge of appsData.edges) {
            const fs = edge.node?.factSheet;
            if (fs?.displayName) {
              applications.push({ id: String(fs['id'] ?? ''), displayName: String(fs['displayName']) });
            }
          }
        }

        const services: { id: string; displayName: string; description?: string }[] = [];
        const servicesData = fullItem?.services;
        if (servicesData?.edges) {
          for (const edge of servicesData.edges) {
            const fs = edge.node?.factSheet;
            if (fs?.displayName) {
              services.push({ id: String(fs['id'] ?? ''), displayName: String(fs['displayName']), description: fs['description'] ?? undefined });
            }
          }
        }

        this.catalogNodeState.update((state) => {
          const next = new Map(state);
          next.set(targetId, { loaded: true, loading: false, children, applications, services });
          return next;
        });
        this.rebuildCatalogRows();
        this.restoreBreadcrumbsPath(ids, index + 1);
      },
      error: () => {
        this.catalogNodeState.update((state) => {
          const next = new Map(state);
          next.set(targetId, { loaded: true, loading: false, children, applications: [], services: [] });
          return next;
        });
        this.rebuildCatalogRows();
        this.restoreBreadcrumbsPath(ids, index + 1);
      },
    });
  }

  private reSortCatalogNodeChildren(): void {
    this.catalogNodeState.update((state) => {
      const needsUpdate = [...state.values()].some((s) => s.loaded);
      if (!needsUpdate) return state;
      const next = new Map(state);
      for (const [nodeId, nodeState] of next) {
        if (nodeState.loaded) {
          const depth = nodeState.children[0]?.depth ?? 1;
          const sortedChildren = this.serviceCatalogService.getItemsByParent(nodeId).map((item) => ({
            id: item.id ?? '',
            displayName: item.displayName ?? '',
            description: item.description ?? undefined,
            abstract: (item as any)['abstract'] ?? false,
            depth,
          }));
          next.set(nodeId, { ...nodeState, children: sortedChildren });
        }
      }
      return next;
    });
  }

  /** Build flat catalog rows from root items. */
  private buildCatalogRowsFromRoot(): void {
    this.reSortCatalogNodeChildren();
    this.populateCatalogAppEntityCache();
    const roots = this.catalogRootItems();
    const rows: CatalogRow[] = [];
    for (const item of roots) {
      const id = item.id ?? '';
      const node: CatalogTreeNode = {
        id,
        displayName: item.displayName ?? '',
        description: item.description ?? undefined,
        abstract: (item as any)['abstract'] ?? false,
        depth: 0,
      };
      const state = this.catalogNodeState().get(id) ?? { loaded: false, loading: false, children: [], applications: [], services: [] };
      rows.push({ type: 'catalog-item', uid: `item-${id}`, node, state });
      this.appendExpandedChildren(rows, node, state);
    }
    this.catalogRows.set(rows);
    this.buildTableRowsFromCatalog();
  }

  /** Recursively append children and applications for expanded nodes. */
  private appendExpandedChildren(rows: CatalogRow[], node: CatalogTreeNode, state: CatalogNodeState): void {
    if (!state.loaded) return;
    for (const child of state.children) {
      const childState = this.catalogNodeState().get(child.id) ?? { loaded: false, loading: false, children: [], applications: [], services: [] };
      rows.push({ type: 'catalog-item', uid: `item-${child.id}`, node: child, state: childState });
      this.appendExpandedChildren(rows, child, childState);
    }
    for (const app of state.applications) {
      const uid = `app-${app.id}`;
      const cachedEntity = this.catalogAppEntityCache.get(app.id) ?? null;
      rows.push({ type: 'catalog-app', uid, appId: app.id, appDisplayName: app.displayName, depth: node.depth + 1, entity: cachedEntity });
    }
    for (const svc of state.services) {
      const uid = `svc-${svc.id}`;
      rows.push({ type: 'catalog-service', uid, serviceId: svc.id, serviceDisplayName: svc.displayName, serviceDescription: svc.description, depth: node.depth + 1 });
    }
  }

  /** Toggle expand/collapse for a catalog node. */
  onCatalogNodeToggle(node: CatalogTreeNode): void {
    const currentState = this.catalogNodeState().get(node.id);
    if (currentState?.loaded) {
      // Collapse: clear state
      this.catalogNodeState.update((state) => {
        const next = new Map(state);
        next.set(node.id, { loaded: false, loading: false, children: [], applications: [], services: [] });
        return next;
      });
      this.rebuildCatalogRows();
    } else {
      // Expand: load from API
      this.expandCatalogNode(node);
    }
  }

  private expandCatalogNode(node: CatalogTreeNode): void {
    this.catalogNodeState.update((state) => {
      const next = new Map(state);
      next.set(node.id, { loaded: false, loading: true, children: [], applications: [], services: [] });
      return next;
    });
    this.rebuildCatalogRows();

    const children: CatalogTreeNode[] = this.serviceCatalogService.getItemsByParent(node.id).map((item) => ({
      id: item.id ?? '',
      displayName: item.displayName ?? '',
      description: item.description ?? undefined,
      abstract: (item as any)['abstract'] ?? false,
      depth: node.depth + 1,
    }));

    this.entityService.getServiceCatalogSection(node.id).subscribe({
      next: (fullItem: any) => {
        const applications: { id: string; displayName: string }[] = [];
        const appsData = fullItem?.applications;
        if (appsData?.edges) {
          for (const edge of appsData.edges) {
            const fs = edge.node?.factSheet;
            if (fs?.displayName) {
              applications.push({ id: String(fs['id'] ?? ''), displayName: String(fs['displayName']) });
            }
          }
        }

        const services: { id: string; displayName: string; description?: string }[] = [];
        const servicesData = fullItem?.services;
        if (servicesData?.edges) {
          for (const edge of servicesData.edges) {
            const fs = edge.node?.factSheet;
            if (fs?.displayName) {
              services.push({ id: String(fs['id'] ?? ''), displayName: String(fs['displayName']), description: fs['description'] ?? undefined });
            }
          }
        }

        this.catalogNodeState.update((state) => {
          const next = new Map(state);
          next.set(node.id, { loaded: true, loading: false, children, applications, services });
          return next;
        });
        this.rebuildCatalogRows();
        this.updateCatalogBreadcrumbs(node.id);
      },
      error: () => {
        this.catalogNodeState.update((state) => {
          const next = new Map(state);
          next.set(node.id, { loaded: true, loading: false, children, applications: [], services: [] });
          return next;
        });
        this.rebuildCatalogRows();
        this.updateCatalogBreadcrumbs(node.id);
      },
    });
  }

  /** Compute the path from root to `targetId` through loaded nodes and store as breadcrumbs. */
  private updateCatalogBreadcrumbs(targetId: string): void {
    const stateMap = this.catalogNodeState();
    const roots = this.catalogRootItems();

    const path = this.findPathToNode(roots, targetId, stateMap);
    const bc = path.join('|');
    this.catalogBreadcrumbs.set(bc);

    if (this.serviceCatalogView()) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { breadcrumbs: bc || null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  /** DFS through loaded nodes to find path from a root to targetId. */
  private findPathToNode(roots: ListEntities200ResponseInner[], targetId: string, stateMap: Map<string, CatalogNodeState>): string[] {
    for (const root of roots) {
      const rootId = root.id ?? '';
      if (rootId === targetId) return [rootId];
      const state = stateMap.get(rootId);
      if (state?.loaded) {
        for (const child of state.children) {
          const subPath = this.findPathToNodeInMap(stateMap, child.id, targetId, []);
          if (subPath.length > 0) {
            return [rootId, ...subPath];
          }
        }
      }
    }
    return [];
  }

  private findPathToNodeInMap(stateMap: Map<string, CatalogNodeState>, currentId: string, targetId: string, visited: string[]): string[] {
    if (currentId === targetId) return [currentId];
    if (visited.includes(currentId)) return [];
    visited.push(currentId);
    const state = stateMap.get(currentId);
    if (!state?.loaded) return [];
    for (const child of state.children) {
      const subPath = this.findPathToNodeInMap(stateMap, child.id, targetId, visited);
      if (subPath.length > 0) {
        return [currentId, ...subPath];
      }
    }
    return [];
  }

  /** Rebuild the flat catalog rows from root, respecting expanded states. */
  private rebuildCatalogRows(): void {
    this.populateCatalogAppEntityCache();
    const roots = this.catalogRootItems();
    const rows: CatalogRow[] = [];
    for (const item of roots) {
      const id = item.id ?? '';
      const node: CatalogTreeNode = {
        id,
        displayName: item.displayName ?? '',
        description: item.description ?? undefined,
        abstract: (item as any)['abstract'] ?? false,
        depth: 0,
      };
      const state = this.catalogNodeState().get(id) ?? { loaded: false, loading: false, children: [], applications: [], services: [] };
      rows.push({ type: 'catalog-item', uid: `item-${id}`, node, state });
      this.appendExpandedChildren(rows, node, state);
    }
    this.catalogRows.set(rows);
    this.buildTableRowsFromCatalog();
  }

  /** Build table rows from catalog rows, merging catalog items and applications into a unified list. */
  private buildTableRowsFromCatalog(): void {
    this._matchingContentCache.clear();
    const rows = this.catalogRows();
    const tableRows: TableListRow[] = [];

    const filters = this.currentFilters();
    const hasActiveFilters = !!(filters.name || filters.technicalSuitability || filters.functionalSuitability ||
      filters.lxTimeClassification || filters.northStarClassification || filters.businessCriticality ||
      filters.relApplicationToBusinessCapability || filters.relApplicationToUserGroup ||
      filters.relApplicationToProject || filters.relApplicationToDataProduct || filters.platformTEMP ||
      (filters.tags && filters.tags.length > 0) ||
      (filters.customFields && Object.keys(filters.customFields).length > 0));
    const matchingIds = hasActiveFilters
      ? new Set(this.applicationsService.applyFilters({ ...filters }).map(a => a.id))
      : null;

    if (hasActiveFilters && matchingIds && matchingIds.size > 0 && !this._autoExpandDone) {
      const catalogLinkedCount = this.countCatalogLinkedMatches(matchingIds);
      if (catalogLinkedCount > 0 && catalogLinkedCount < 5) {
        this._autoExpandDone = true;
        this.autoExpandAllCatalogNodes();
        this.rebuildCatalogRows();
        return;
      }
    }

    // Collapse previously auto-expanded nodes when condition no longer applies
    if (this._autoExpandedNodeIds.size > 0) {
      const catalogLinkedCount = hasActiveFilters && matchingIds
        ? this.countCatalogLinkedMatches(matchingIds)
        : 0;
      if (catalogLinkedCount === 0 || catalogLinkedCount >= 5) {
        this.collapseAutoExpandedNodes();
        this.rebuildCatalogRows();
        return;
      }
    }

    for (const row of rows) {
      if (row.type === 'catalog-item') {
        if (!hasActiveFilters || this.catalogNodeHasMatchingContent(row.node.id, matchingIds)) {
          tableRows.push({ rowKind: 'catalog-item', uid: row.uid, node: row.node, state: row.state });
        }
      } else if (row.type === 'catalog-app') {
        if (row.entity) {
          if (!matchingIds || matchingIds.has(row.entity.id ?? row.appId)) {
            tableRows.push({ rowKind: 'application', uid: `app-${row.entity.id ?? crypto.randomUUID()}`, entity: row.entity });
          }
        } else {
          if (!matchingIds) {
            tableRows.push({ rowKind: 'catalog-app', uid: row.uid, appId: row.appId, appDisplayName: row.appDisplayName, depth: row.depth, entity: null });
          }
        }
      } else if (row.type === 'catalog-service') {
        tableRows.push({ rowKind: 'catalog-service', uid: row.uid, serviceId: row.serviceId, serviceDisplayName: row.serviceDisplayName, serviceDescription: row.serviceDescription, depth: row.depth });
      }
    }

    if (this.stackAppsEnabled()) {
      let i = 0;
      while (i < tableRows.length) {
        if (tableRows[i].rowKind !== 'application') {
          i++;
          continue;
        }
        let j = i;
        const entities: ListEntities200ResponseInner[] = [];
        while (j < tableRows.length && tableRows[j].rowKind === 'application') {
          entities.push((tableRows[j] as { rowKind: 'application'; entity: ListEntities200ResponseInner }).entity);
          j++;
        }
        const appItems = entities.map(e => e as unknown as ApplicationItem);
        const stacked = stackApplications(appItems);
        const stackedRows: TableListRow[] = stacked.map(item => ({
          rowKind: 'application' as const,
          uid: `app-${item.id}`,
          entity: this.applicationItemToEntity(item),
        }));
        tableRows.splice(i, j - i, ...stackedRows);
        i += stackedRows.length;
      }
    }

    this.tableRows.set(tableRows);
    this.unifiedTableData.set(tableRows);
  }

  /**
   * Check if a catalog node (or any descendant) has applications matching the current filter.
   * Uses loaded state map data for expanded nodes and ServiceCatalogService bulk data otherwise.
   * Results are cached to avoid redundant tree traversals.
   */
  private catalogNodeHasMatchingContent(
    nodeId: string,
    matchingIds: Set<string> | null,
    cache: Map<string, boolean> = this._matchingContentCache
  ): boolean {
    if (!matchingIds) return true;
    const cached = cache.get(nodeId);
    if (cached !== undefined) return cached;

    let result = false;

    // For loaded (expanded) nodes, use state map data from individual GET
    const state = this.catalogNodeState().get(nodeId);
    if (state?.loaded) {
      for (const app of state.applications) {
        if (matchingIds.has(app.id)) { result = true; break; }
      }
      if (!result) {
        for (const child of state.children) {
          if (this.catalogNodeHasMatchingContent(child.id, matchingIds, cache)) {
            result = true;
            break;
          }
        }
      }
    } else {
      // For unloaded nodes, use bulk-loaded ServiceCatalogService data
      const item = this.serviceCatalogService.getItemById(nodeId);
      if (item) {
        const appsData = (item as any).applications;
        if (appsData?.edges) {
          for (const edge of appsData.edges) {
            const fs = edge.node?.factSheet;
            if (fs) {
              const appId = String(fs['id'] ?? '');
              if (matchingIds.has(appId)) { result = true; break; }
            }
          }
        }
      }
      if (!result) {
        const children = this.serviceCatalogService.getItemsByParent(nodeId);
        for (const child of children) {
          if (this.catalogNodeHasMatchingContent(child.id ?? '', matchingIds, cache)) {
            result = true;
            break;
          }
        }
      }
    }

    cache.set(nodeId, result);
    return result;
  }

  /** Update a catalog-app row with its loaded entity and rebuild table rows. */
  private updateCatalogAppRowEntity(uid: string, entity: ListEntities200ResponseInner): void {
    this.catalogRows.update((currentRows) =>
      currentRows.map((r) => r.type === 'catalog-app' && r.uid === uid ? { ...r, entity } : r)
    );
    this.buildTableRowsFromCatalog();
  }

  /**
   * Recursively expand all catalog nodes synchronously using bulk-loaded data (no API calls).
   * Populates the catalogNodeState map for every node in the tree so that the entire hierarchy
   * is visible when auto-expand triggers.
   */
  private autoExpandAllCatalogNodes(): void {
    this._preAutoExpandBreadcrumbs = this.catalogBreadcrumbs();
    this._autoExpandedNodeIds.clear();
    const expandNode = (nodeId: string, depth: number): void => {
      const current = this.catalogNodeState().get(nodeId);
      if (current?.loaded) return;

      const children = this.serviceCatalogService.getItemsByParent(nodeId).map((item) => ({
        id: item.id ?? '',
        displayName: item.displayName ?? '',
        description: item.description ?? undefined,
        abstract: (item as any)['abstract'] ?? false,
        depth: depth + 1,
      }));

      const applications: { id: string; displayName: string }[] = [];
      const services: { id: string; displayName: string; description?: string }[] = [];
      const item = this.serviceCatalogService.getItemById(nodeId);
      if (item) {
        const appsData = (item as any).applications;
        if (appsData?.edges) {
          for (const edge of appsData.edges) {
            const fs = edge.node?.factSheet;
            if (fs?.displayName) {
              applications.push({ id: String(fs['id'] ?? ''), displayName: String(fs['displayName']) });
            }
          }
        }
        const servicesData = (item as any).services;
        if (servicesData?.edges) {
          for (const edge of servicesData.edges) {
            const fs = edge.node?.factSheet;
            if (fs?.displayName) {
              services.push({ id: String(fs['id'] ?? ''), displayName: String(fs['displayName']), description: fs['description'] ?? undefined });
            }
          }
        }
      }

      this.catalogNodeState.update((state) => {
        const next = new Map(state);
        next.set(nodeId, { loaded: true, loading: false, children, applications, services });
        return next;
      });
      this._autoExpandedNodeIds.add(nodeId);

      // Recursively expand children
      for (const child of children) {
        expandNode(child.id, depth + 1);
      }
    };

    for (const root of this.serviceCatalogService.rootItems()) {
      expandNode(root.id ?? '', 0);
    }
  }

  /** Collapse all nodes that were previously auto-expanded. */
  private collapseAutoExpandedNodes(): void {
    this.catalogNodeState.update((state) => {
      const next = new Map(state);
      for (const id of this._autoExpandedNodeIds) {
        next.set(id, { loaded: false, loading: false, children: [], applications: [], services: [] });
      }
      return next;
    });
    this._autoExpandedNodeIds.clear();

    // Restore breadcrumbs and re-expand the breadcrumb path
    const savedBreadcrumbs = this._preAutoExpandBreadcrumbs;
    this._preAutoExpandBreadcrumbs = '';
    if (savedBreadcrumbs) {
      this.catalogBreadcrumbs.set(savedBreadcrumbs);
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { breadcrumbs: savedBreadcrumbs || null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
      this.expandBreadcrumbPathFromBulkData(savedBreadcrumbs);
    }
  }

  /**
   * Expand the nodes along a breadcrumb path synchronously using bulk-loaded ServiceCatalogService data.
   * Called when collapsing auto-expanded nodes to restore manual navigation state.
   */
  private expandBreadcrumbPathFromBulkData(breadcrumbs: string): void {
    const ids = breadcrumbs.split('|').filter(Boolean);
    if (ids.length === 0) return;

    let changed = false;
    for (let i = 0; i < ids.length; i++) {
      const nodeId = ids[i];
      const existing = this.catalogNodeState().get(nodeId);
      if (existing?.loaded) continue;

      const children = this.serviceCatalogService.getItemsByParent(nodeId).map((item) => ({
        id: item.id ?? '',
        displayName: item.displayName ?? '',
        description: item.description ?? undefined,
        abstract: (item as any)['abstract'] ?? false,
        depth: i + 1,
      }));

      const applications: { id: string; displayName: string }[] = [];
      const services: { id: string; displayName: string; description?: string }[] = [];
      const item = this.serviceCatalogService.getItemById(nodeId);
      if (item) {
        const appsData = (item as any).applications;
        if (appsData?.edges) {
          for (const edge of appsData.edges) {
            const fs = edge.node?.factSheet;
            if (fs?.displayName) {
              applications.push({ id: String(fs['id'] ?? ''), displayName: String(fs['displayName']) });
            }
          }
        }
        const servicesData = (item as any).services;
        if (servicesData?.edges) {
          for (const edge of servicesData.edges) {
            const fs = edge.node?.factSheet;
            if (fs?.displayName) {
              services.push({ id: String(fs['id'] ?? ''), displayName: String(fs['displayName']), description: fs['description'] ?? undefined });
            }
          }
        }
      }

      this.catalogNodeState.update((state) => {
        const next = new Map(state);
        next.set(nodeId, { loaded: true, loading: false, children, applications, services });
        return next;
      });
      changed = true;
    }

    if (changed) {
      this.rebuildCatalogRows();
    }
  }

  /**
   * Count how many of the given matching app IDs are linked to at least one ServiceCatalogSection.
   * This prevents auto-expand from triggering on filters that match many uncataloged apps.
   */
  private countCatalogLinkedMatches(matchingIds: Set<string>): number {
    const catalogAppIds = new Set<string>();
    for (const item of this.serviceCatalogService.items()) {
      const appsData = (item as any).applications;
      if (appsData?.edges) {
        for (const edge of appsData.edges) {
          const fs = edge.node?.factSheet;
          if (fs) catalogAppIds.add(String(fs['id'] ?? ''));
        }
      }
    }
    let count = 0;
    for (const id of matchingIds) {
      if (catalogAppIds.has(id)) count++;
    }
    return count;
  }

  /** Normalize a raw API application entity to match ListEntities200ResponseInner shape. */
  private normalizeApplicationEntity(raw: any): ListEntities200ResponseInner {
    if (!raw) return {} as ListEntities200ResponseInner;
    // Start with ALL fields from the raw entity (API now returns complete entity data)
    const result: any = { ...raw };
    // Ensure base fields are present with correct defaults
    result.id = raw.id ?? '';
    result.type = raw.type ?? 'Application';
    result.displayName = raw.displayName ?? '';
    // Map relation fields to the list format (edges notation → flat array)
    result.migrationTarget = this.extractRelationApps(raw.migrationTarget);
    result.alternatives = this.extractRelationApps(raw.alternatives);
    result.relApplicationToBusinessCapability = this.extractRelationFacets(raw.relApplicationToBusinessCapability);
    result.relApplicationToUserGroup = this.extractRelationFacets(raw.relApplicationToUserGroup);
    result.relApplicationToDataProduct = this.extractRelationFacets(raw.relApplicationToDataProduct);
    return result;
  }

  private extractRelationApps(relation: any): any[] {
    if (!relation) return [];
    if (Array.isArray(relation)) return relation;
    if (relation.edges && Array.isArray(relation.edges)) {
      return relation.edges.map((edge: any) => {
        const fs = edge?.node?.factSheet ?? {};
        return {
          id: fs.id ?? '',
          type: fs.type ?? 'Application',
          displayName: fs.displayName ?? fs.id ?? '',
          ...edge,
        };
      });
    }
    return [];
  }

  private extractRelationFacets(relation: any): any[] {
    if (!relation) return [];
    if (Array.isArray(relation)) return relation;
    if (relation.edges && Array.isArray(relation.edges)) {
      return relation.edges.map((edge: any) => {
        const fs = edge?.node?.factSheet ?? {};
        return {
          id: fs.id ?? '',
          type: fs.type ?? '',
          displayName: fs.displayName ?? fs.fullName ?? fs.id ?? '',
          fullName: fs.fullName ?? fs.displayName ?? '',
          description: fs.description ?? '',
        };
      });
    }
    return [];
  }

  /** Click on catalog item label: navigate to entity if not abstract, otherwise toggle expand. */
  onCatalogLabelClick(node: CatalogTreeNode): void {
    if (!node.abstract) {
      const extras = this.serviceCatalogView()
        ? { state: { returnTo: this.userConfig.projectUrlString('list/Applications?view=ServiceCatalog') } }
        : {};
      this.router.navigate(this.userConfig.projectUrl(['entity', 'ServiceCatalogSection', node.id]), extras);
    } else {
      this.onCatalogNodeToggle(node);
    }
  }

  /** Click on catalog edit button: navigate to entity edit page. */
  onCatalogEditClick(node: CatalogTreeNode): void {
    const extras = this.serviceCatalogView()
      ? { state: { returnTo: this.userConfig.projectUrlString('list/Applications?view=ServiceCatalog') } }
      : {};
    this.router.navigate(this.userConfig.projectUrl(['entity', 'ServiceCatalogSection', node.id]), extras);
  }

  trackRowByUid(index: number, row: TableListRow): string {
    return row.uid;
  }

  /** Column widths in pixels for fixed table layout alignment. */
  colWidths: Record<string, number> = {
    lifecycle: 32,
    northStarClassification: 48,
    displayName: 220,
    earmarkingsTEMP: 120,
    platformTEMP: 150,
    lxTimeClassification: 110,
    migrationTarget: 200,
    alternatives: 180,
    functionalSuitability: 120,
    technicalSuitability: 120,
    businessCriticality: 120,
    relApplicationToBusinessCapability: 180,
    relApplicationToUserGroup: 180,
    relApplicationToDataProduct: 180,
    actions: 96,
  };

  getColumnLabel(colId: string): string {
    const meta = TOGGLEABLE_COLUMNS.find((c) => c.id === colId);
    return meta?.label ?? colId;
  }

  asRecord(entity: ListEntities200ResponseInner): Record<string, unknown> {
    return entity as unknown as Record<string, unknown>;
  }

  /** Check if an application ID no longer exists in pre-loaded data. */
  isAppDeleted(id: string): boolean {
    const apps = this.applicationsService.applications();
    if (apps.length === 0) return false;
    return id !== '' && !apps.some(a => a.id === id);
  }

  /** Called when a catalog-app row is rendered in the viewport. Returns empty string for template interpolation. */
  onCatalogAppRowRendered(appId: string, uid: string): string {
    const cached = this.catalogAppEntityCache.get(appId);
    if (cached) {
      this.updateCatalogAppRowEntity(uid, cached);
    }
    return '';
  }

  /** Navigate to a new entity page with a random GUID (server may 404 until Save). */
  onNew(): void {
    const guid = crypto.randomUUID();
    this.router.navigate(this.userConfig.projectUrl(['entity', 'Application', guid]));
  }

  /** Navigate to a new ServiceCatalogSection entity page (catalog view). */
  onNewCatalogItem(): void {
    const guid = crypto.randomUUID();
    this.router.navigate(this.userConfig.projectUrl(['entity', 'ServiceCatalogSection', guid]), {
      state: { returnTo: this.userConfig.projectUrlString('list/Applications?view=ServiceCatalog') },
    });
  }

  /** Toggle expand/collapse for a catalog node from table row. */
  onCatalogNodeToggleFromTable(row: TableListRow): void {
    if (row.rowKind !== 'catalog-item') return;
    this.onCatalogNodeToggle(row.node);
  }

  /** Click on catalog item label from table row. */
  onCatalogLabelClickFromTable(row: TableListRow): void {
    if (row.rowKind !== 'catalog-item') return;
    this.onCatalogLabelClick(row.node);
  }

  /** Click on catalog edit button from table row. */
  onCatalogEditClickFromTable(row: TableListRow): void {
    if (row.rowKind !== 'catalog-item') return;
    this.onCatalogEditClick(row.node);
  }

  /** Click on catalog service name from table row. */
  onCatalogServiceClick(serviceId: string): void {
    this.router.navigate(this.userConfig.projectUrl(['entity', 'ServiceCatalogService', serviceId]));
  }

  /** Get indentation style for catalog item rows. */
  getCatalogRowIndentStyle(row: TableListRow): { paddingLeft: string } | {} {
    if (row.rowKind !== 'catalog-item') return {};
    return { paddingLeft: `${row.node.depth * 24}px` };
  }

  /** Predicate for mat-row when directive: application rows. */
  isApplicationRow(index: number, row: TableListRow): boolean {
    return row.rowKind === 'application';
  }

  /** Predicate for mat-row when directive: catalog item rows. */
  isCatalogItemRow(index: number, row: TableListRow): boolean {
    return row.rowKind === 'catalog-item';
  }

  /** Whether this application row is a stacked pseudo-app. */
  isStackedApplication(row: TableListRow): boolean {
    return row.rowKind === 'application' && row.entity?.id?.startsWith('stacked_') === true;
  }

  /** Get the count of stacked applications for a row. */
  getStackedCount(row: TableListRow): number {
    if (!this.isStackedApplication(row) || row.rowKind !== 'application') return 0;
    const stacked = (row.entity as unknown as { stackedApplications?: unknown[] })?.stackedApplications;
    return stacked?.length ?? 0;
  }

  /** Get display names of stacked applications for tooltip. */
  getStackedAppNames(row: TableListRow): string {
    if (!this.isStackedApplication(row) || row.rowKind !== 'application') return '';
    const stacked = (row.entity as unknown as { stackedApplications?: Array<{ displayName: string }> })?.stackedApplications;
    return stacked?.map(a => a.displayName).join(', ') ?? '';
  }

  private getOriginalAppsFromStackedRow(row: TableListRow): ApplicationItem[] {
    if (!this.isStackedApplication(row) || row.rowKind !== 'application') return [];
    const stackedApps = (row.entity as unknown as { stackedApplications?: ApplicationItem[] })?.stackedApplications;
    if (Array.isArray(stackedApps) && stackedApps.length > 0) {
      return stackedApps;
    }
    const stackedName = (row.entity.displayName as string)?.replace(/\*$/, '').trim();
    if (!stackedName) return [];
    return this.applicationsService.applications().filter((app) => computeDisplayNameStacked(app.displayName) === stackedName);
  }

  /** Handle click on application label: unstack if stacked, otherwise navigate to edit entity view. */
  onApplicationLabelClick(event: MouseEvent, row: TableListRow): void {
    if (this.isStackedApplication(row)) {
      event.preventDefault();
      this.unstackApplication(row);
    } else if (row.rowKind === 'application') {
      this.router.navigate(this.userConfig.projectUrl(['entity', 'Application', row.entity.id]));
    }
  }

  /** Unstack a stacked application: replace it with its original apps in the table. */
  unstackApplication(row: TableListRow): void {
    if (!this.isStackedApplication(row) || row.rowKind !== 'application') return;
    const currentData = this.unifiedTableData();
    const rowIndex = currentData.findIndex((r) => r.uid === row.uid);
    if (rowIndex === -1) return;

    const originalApps = this.getOriginalAppsFromStackedRow(row);

    if (originalApps.length === 0) return;

    // Replace the stacked row with original app rows
    const newRows = [...currentData];
    const replacementRows: TableListRow[] = originalApps.map((app) => ({
      rowKind: 'application',
      uid: `app-${app.id}`,
      entity: this.applicationItemToEntity(app),
    }));
    newRows.splice(rowIndex, 1, ...replacementRows);
    this.unifiedTableData.set(newRows);
    this.displayedCount.set(newRows.filter((r) => r.rowKind === 'application').length);
  }

  /** Unstack all stacked rows currently visible in the list. */
  unstackAllStackedApplications(): void {
    const currentData = this.unifiedTableData();
    if (currentData.length === 0) return;

    let changed = false;
    const nextRows: TableListRow[] = [];
    for (const row of currentData) {
      if (this.isStackedApplication(row) && row.rowKind === 'application') {
        const originalApps = this.getOriginalAppsFromStackedRow(row);
        if (originalApps.length > 0) {
          changed = true;
          nextRows.push(...originalApps.map((app) => ({
            rowKind: 'application' as const,
            uid: `app-${app.id}`,
            entity: this.applicationItemToEntity(app),
          })));
          continue;
        }
      }
      nextRows.push(row);
    }

    if (!changed) return;
    this.unifiedTableData.set(nextRows);
    this.displayedCount.set(nextRows.filter((r) => r.rowKind === 'application').length);
  }

  /** Columns for a table row based on its kind. */
  getColumnsForTableRow(row: TableListRow): string[] {
    return row.rowKind === 'catalog-item' ? ['catalogItem'] : this.displayedColumns;
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
    const allRows = this.unifiedTableData();
    if (allRows.length === 0) return;
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

    if (this.serviceCatalogView()) {
      await this.exportCatalogCatalogView(ExcelJSDefault, saveAsFn, allRows);
    } else {
      await this.exportApplicationsExcel(ExcelJSDefault, saveAsFn, allRows);
    }
  }

  /** Collect all descendant application displayNames for a catalog node, filtered by matchingIds. */
  private collectDescendantAppNames(nodeId: string, matchingIds: Set<string> | null): string[] {
    const result: string[] = [];
    const state = this.catalogNodeState();

    const nodeState = state.get(nodeId);
    if (nodeState?.loaded) {
      for (const app of nodeState.applications) {
        if (!matchingIds || matchingIds.has(app.id)) {
          result.push(app.displayName);
        }
      }
    } else {
      const item = this.serviceCatalogService.getItemById(nodeId);
      if (item) {
        const appsData = (item as any).applications;
        if (appsData?.edges) {
          for (const edge of appsData.edges) {
            const fs = edge.node?.factSheet;
            if (fs?.displayName) {
              const appId = String(fs['id'] ?? '');
              if (!matchingIds || matchingIds.has(appId)) {
                result.push(String(fs['displayName']));
              }
            }
          }
        }
      }
    }

    const children = this.serviceCatalogService.getItemsByParent(nodeId);
    for (const child of children) {
      result.push(...this.collectDescendantAppNames(child.id ?? '', matchingIds));
    }

    return result;
  }

  /** Collect all descendant service displayNames for a catalog node, filtered by matchingIds. */
  private collectDescendantServiceNames(nodeId: string, matchingIds: Set<string> | null): string[] {
    const result: string[] = [];

    const nodeState = this.catalogNodeState().get(nodeId);
    if (nodeState?.loaded) {
      for (const svc of nodeState.services) {
        result.push(svc.displayName);
      }
    } else {
      const item = this.serviceCatalogService.getItemById(nodeId);
      if (item) {
        const servicesData = (item as any).services;
        if (servicesData?.edges) {
          for (const edge of servicesData.edges) {
            const fs = edge.node?.factSheet;
            if (fs?.displayName) {
              result.push(String(fs['displayName']));
            }
          }
        }
      }
    }

    const children = this.serviceCatalogService.getItemsByParent(nodeId);
    for (const child of children) {
      result.push(...this.collectDescendantServiceNames(child.id ?? '', matchingIds));
    }

    return result;
  }

  /** Recursively add all catalog nodes (regardless of expand/collapse state) to the worksheet. */
  private _appendFullCatalogTree(
    ws: any,
    parentId: string | null,
    depth: number,
    matchingIds: Set<string> | null,
    ancestorHasMore: boolean[] = []
  ): void {
    const items = parentId === null
      ? this.serviceCatalogService.rootItems()
      : this.serviceCatalogService.getItemsByParent(parentId);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const id = item.id ?? '';
      if (!id) continue;

      if (matchingIds && !this.catalogNodeHasMatchingContent(id, matchingIds)) continue;

      const isLast = i === items.length - 1;

      let prefix = '';
      for (let j = 0; j < depth; j++) {
        prefix += ancestorHasMore[j] ? ' │ ' : '   ';
      }
      if (depth > 0) {
        prefix += isLast ? '└ ' : '├ ';
      }

      const name = `${prefix}${item.displayName ?? ''}`;
      const description = item.description ?? '';
      const appNames = this.collectDescendantAppNames(id, matchingIds);
      const svcNames = this.collectDescendantServiceNames(id, matchingIds);
      ws.addRow([name, description, appNames.join(', '), svcNames.join(', ')]);

      this._appendFullCatalogTree(ws, id, depth + 1, matchingIds, [...ancestorHasMore, !isLast]);
    }
  }

  /** Recursively collect all catalog applications with their full catalog paths. */
  private _collectFullCatalogApps(
    parentId: string | null,
    ancestorsPath: string[],
    matchingIds: Set<string> | null
  ): { entity: ListEntities200ResponseInner; catalogPath: string }[] {
    const result: { entity: ListEntities200ResponseInner; catalogPath: string }[] = [];

    const items = parentId === null
      ? this.serviceCatalogService.rootItems()
      : this.serviceCatalogService.getItemsByParent(parentId);

    for (const item of items) {
      const id = item.id ?? '';
      if (!id) continue;

      if (matchingIds && !this.catalogNodeHasMatchingContent(id, matchingIds)) continue;

      const displayName = item.displayName ?? '';
      const currentPath = [...ancestorsPath, displayName];

      const itemData = this.serviceCatalogService.getItemById(id);
      if (itemData) {
        const appsData = (itemData as any).applications;
        if (appsData?.edges) {
          for (const edge of appsData.edges) {
            const fs = edge.node?.factSheet;
            if (fs) {
              const appId = String(fs['id'] ?? '');
              if (!matchingIds || matchingIds.has(appId)) {
                const entity = this.catalogAppEntityCache.get(appId) ?? null;
                if (entity) {
                  result.push({ entity, catalogPath: currentPath.join(' > ') });
                }
              }
            }
          }
        }
      }

      result.push(...this._collectFullCatalogApps(id, currentPath, matchingIds));
    }

    return result;
  }

  /** Export for Service Catalog PDF view: TOC, hierarchical catalog items, applications table. */
  async onExportPdf(): Promise<void> {
    const filters = this.currentFilters();
    const hasActiveFilters = !!(filters.name || filters.technicalSuitability || filters.functionalSuitability ||
      filters.lxTimeClassification || filters.northStarClassification || filters.businessCriticality ||
      filters.relApplicationToBusinessCapability || filters.relApplicationToUserGroup ||
      filters.relApplicationToProject || filters.relApplicationToDataProduct || filters.platformTEMP ||
      (filters.tags && filters.tags.length > 0) ||
      (filters.customFields && Object.keys(filters.customFields).length > 0));
    const matchingIds = hasActiveFilters
      ? new Set(this.applicationsService.applyFilters({ ...filters }).map(a => a.id))
      : null;

    if (this.serviceCatalogService.items().length === 0) return;
    this.snackBar.open('Download started…', '', { duration: 3000 });
    this.populateCatalogAppEntityCache();

    const [{ default: jsPDF }, { default: autoTable }, FileSaverModule] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
      import('file-saver'),
    ]);
    const saveAsFn = (FileSaverModule as any)?.saveAs ?? (FileSaverModule as any)?.default ?? FileSaverModule;
    if (typeof saveAsFn !== 'function') {
      console.error('file-saver saveAs export not found', FileSaverModule);
      return;
    }

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    const lhMm = (pt: number): number => pt * 1.15 * 25.4 / 72;

    interface PdfTocEntry {
      displayName: string;
      depth: number;
      page: number;
    }
    interface TocLayout {
      page: number;
      y: number;
      entry: PdfTocEntry;
    }

    const catalogItems: PdfCatalogItem[] = [];
    this._collectPdfTreeItems(null, 0, matchingIds, catalogItems);

    // -- Column serializers (same as Excel export) --
    const customFields = this.customFields();
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
      northStarClassification: {
        header: 'North Star',
        value: (row) => String((row as unknown as Record<string, unknown>)['northStarClassification'] ?? ''),
      },
      migrationTarget: {
        header: 'Migration target',
        value: (row) => this.serializeMigrationTarget(row).replace(/\n/g, ', '),
      },
      alternatives: {
        header: 'Alternatives',
        value: (row) => this.serializeAlternatives(row).replace(/\n/g, '; '),
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
            .join(', '),
      },
      relApplicationToUserGroup: {
        header: 'User Group',
        value: (row) =>
          (row.relApplicationToUserGroup ?? [])
            .map((g) => g.displayName ?? g.fullName ?? g.id ?? '')
            .filter(Boolean)
            .join(', '),
      },
      relApplicationToDataProduct: {
        header: 'Data Products',
        value: (row) =>
          (row.relApplicationToDataProduct ?? [])
            .map((p) => p.displayName ?? p.fullName ?? p.id ?? '')
            .filter(Boolean)
            .join(', '),
      },
    };
    Object.entries(customFields).forEach(([key, def]) => {
      const header = def.label?.['en'] ?? def.label?.[Object.keys(def.label)[0]] ?? key;
      columnSerializers[key] = {
        header,
        value: (row) => {
          const val = row[key as keyof ListEntities200ResponseInner];
          if (val == null) return '';
          if (def.type === 'selectMultiple' && Array.isArray(val)) {
            return val.join(', ');
          }
          return String(val);
        },
      };
    });

    const forcedColumns = ['lifecycle', 'northStarClassification', 'displayName'];
    const visibleColumns = [
      ...forcedColumns,
      ...this.displayedColumns.filter((c) => c !== 'actions' && columnSerializers[c] && !forcedColumns.includes(c)),
    ];

    // -- RENDER: Title page --
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.text('Service Catalog', margin, 35);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'normal');
    const repo = this.userConfig.getRepoName();
    const branch = this.userConfig.getBranch();
    doc.text(`${repo} / ${branch}`, margin, 46);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 55);
    if (hasActiveFilters) {
      doc.text('(Filtered view — only items matching current criteria are included)', margin, 62);
    }
    doc.setTextColor(0);

    // -- RENDER: Table of Contents --
    doc.addPage();
    const tocPageNum = doc.getNumberOfPages();
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Contents', margin, 25);
    doc.setFont('helvetica', 'normal');

    const tocEntries: PdfTocEntry[] = [];
    const tocLayouts: TocLayout[] = [];
    let tocY = 35;
    const tocLineH = 6;

    for (const item of catalogItems) {
      if (tocY > pageHeight - margin - 5) {
        doc.addPage();
        tocY = 20;
      }
      const indent = item.depth * 4;
      const label = `${item.number}  ${item.displayName}`;
      doc.setFontSize(10);
      doc.text(label, margin + indent, tocY);
      const entry: PdfTocEntry = { displayName: label, depth: item.depth, page: 0 };
      tocEntries.push(entry);
      tocLayouts.push({ page: doc.getNumberOfPages(), y: tocY, entry });
      tocY += tocLineH;
    }

    // -- RENDER: Catalog item sections (main categories start new page; sub-items flow) --
    let yPos = 25;

    for (let i = 0; i < catalogItems.length; i++) {
      const item = catalogItems[i];
      const startPage = doc.getNumberOfPages();
      tocEntries[i].page = startPage;

      const headingSize = Math.max(12, 18 - item.depth * 3);
      if (item.depth === 0) {
        doc.addPage();
        yPos = 25;
      } else {
        const headingAdvance = lhMm(10) + (yPos > margin + 5 ? lhMm(headingSize) / 2 : 0) + lhMm(headingSize) + 2;
        const yAfterHeading = yPos + headingAdvance;

        let contentBreaksAfterHeading = false;
        if (item.description) {
          const cleanDesc = item.description.replace(/\u2011/g, '-').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\u200B-\u200F\uFEFF]/g, '');
          const descLines = doc.splitTextToSize(cleanDesc, contentWidth);
          const descAdvance = (descLines.length - 1) * lhMm(10) + 5;
          contentBreaksAfterHeading = yAfterHeading + descAdvance > pageHeight - margin - 3;
        } else if (item.businessCapabilities.length > 0) {
          contentBreaksAfterHeading = yAfterHeading + lhMm(10) / 2 > pageHeight - margin - 2 * lhMm(10);
        } else if (item.applications.length > 0) {
          const appsAdv = lhMm(10) + lhMm(10) / 2 + 1.5 + 2;
          contentBreaksAfterHeading = yAfterHeading + appsAdv + 25 > pageHeight - margin;
        }

        if (yPos > pageHeight - margin - 30 || contentBreaksAfterHeading) {
          doc.addPage();
          yPos = 25;
        } else {
          yPos += lhMm(10);
        }
      }

      if (yPos > margin + 5) {
        yPos += lhMm(headingSize) / 2;
      }
      doc.setFontSize(headingSize);
      doc.setFont('helvetica', 'bold');
      doc.text(`${item.number}  ${item.displayName}`, margin, yPos);
      yPos += lhMm(headingSize) + 2;

      if (item.description) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const cleanDesc = item.description.replace(/\u2011/g, '-').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\u200B-\u200F\uFEFF]/g, '');
        const descLines = doc.splitTextToSize(cleanDesc, contentWidth);
        const descAdvance = (descLines.length - 1) * lhMm(10) + 5;
        if (yPos + descAdvance > pageHeight - margin - 3) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(descLines, margin, yPos);
        yPos += descAdvance;
      }

      if (item.businessCapabilities.length > 0) {
        if (yPos + lhMm(10) / 2 > pageHeight - margin - 2 * lhMm(10)) {
          doc.addPage();
          yPos = 20;
        }
        yPos += lhMm(10) / 2;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Business Capabilities:', margin, yPos);
        yPos += lhMm(10);
        doc.setFont('helvetica', 'normal');
        const capSanitize = (s: string) => s.replace(/\u2011/g, '-').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\u200B-\u200F\uFEFF]/g, '');
        for (const cap of item.businessCapabilities) {
          const bulletText = `  •  ${capSanitize(cap)}`;
          const bulletLines = doc.splitTextToSize(bulletText, contentWidth);
          const bulletAdvance = (bulletLines.length - 1) * lhMm(10) + lhMm(10);
          if (yPos + bulletAdvance > pageHeight - margin - 5) {
            doc.addPage();
            yPos = 20;
          }
          doc.text(bulletLines, margin, yPos);
          yPos += bulletAdvance;
        }
      }

      // -- Per-node applications table --
      if (item.applications.length > 0) {
        const appsHeadingAdvance = lhMm(10) + lhMm(10) / 2 + 1.5;
        let tableStartY = yPos + appsHeadingAdvance + 2;
        if (tableStartY + 25 > pageHeight - margin) {
          doc.addPage();
          yPos = 20;
          tableStartY = yPos + appsHeadingAdvance + 2;
        }

        yPos += lhMm(10);
        yPos += lhMm(10) / 2;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Applications:', margin, yPos);
        yPos += 1.5;
        doc.setFont('helvetica', 'normal');
        const tableHeaders = visibleColumns.map((c) => columnSerializers[c].header);
        const lifecycleIdx = visibleColumns.indexOf('lifecycle');
        const northStarIdx = visibleColumns.indexOf('northStarClassification');
        const timeIdx = visibleColumns.indexOf('lxTimeClassification');
        const colStyles: Record<string, any> = {};
        if (lifecycleIdx >= 0) colStyles[lifecycleIdx] = { cellWidth: 8 };
        if (northStarIdx >= 0) colStyles[northStarIdx] = { cellWidth: 14 };
        if (timeIdx >= 0) colStyles[timeIdx] = { cellWidth: 14 };

        const displayNameIdx = visibleColumns.indexOf('displayName');
        const deletedAppIds = new Set(item.applications.filter(a => !a.entity).map(a => a.id));
        const tableBody = item.applications.map((a) => {
          const ent = a.entity;
          if (ent) {
            return visibleColumns.map((c) => columnSerializers[c].value(ent));
          }
          const row = Array(visibleColumns.length).fill('');
          if (displayNameIdx >= 0) row[displayNameIdx] = a.displayName;
          return row;
        });

        let tableEndCursorY: number | null = null;
        const pageBeforeTable = doc.getNumberOfPages();
        autoTable(doc, {
          startY: tableStartY,
          head: [tableHeaders],
          body: tableBody,
          styles: { fontSize: 6.5, cellPadding: 1, overflow: 'linebreak', halign: 'left' },
          headStyles: { fillColor: [51, 51, 51], textColor: [255, 255, 255], fontSize: 6.5, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 245, 245] },
          margin: { left: margin, right: margin },
          showHead: 'everyPage',
          tableWidth: 'auto',
          tableLineWidth: 0.25,
          tableLineColor: [200, 200, 200],
          columnStyles: colStyles,
          willDrawCell: (data: any) => {
            const col = data.column.index;
            if (col === lifecycleIdx || col === northStarIdx || col === timeIdx) {
              data.cell.text = [];
            }
            if (data.section === 'body') {
              const appId = item.applications[data.row.index]?.id;
              if (appId && deletedAppIds.has(appId)) {
                data.cell.styles.textColor = [180, 180, 180];
              }
            }
          },
          didDrawPage: (data: any) => {
            tableEndCursorY = data.cursor?.y ?? null;
          },
          didDrawCell: (data: any) => {
            const cell = data.cell;
            if (lifecycleIdx >= 0 && data.column.index === lifecycleIdx) {
              const val = (data.cell.raw ?? '').toString().trim().toLowerCase();
              const dot: Record<string, [number, number, number]> = {
                phasein: [251, 140, 0], active: [46, 125, 50],
                phaseout: [198, 40, 40], endoflife: [198, 40, 40],
              };
              const c = dot[val];
              if (c) {
                doc.setFillColor(c[0], c[1], c[2]);
                doc.circle(cell.x + 2.5, cell.y + cell.height / 2, 1.3, 'F');
              }
            }
            if (timeIdx >= 0 && data.column.index === timeIdx) {
              const val = (data.cell.raw ?? '').toString().trim().toLowerCase();
              const badge: Record<string, [number, number, number]> = {
                tolerate: [18, 203, 237], invest: [25, 200, 34],
                migrate: [237, 135, 2], eliminate: [198, 40, 40],
              };
              const bc = badge[val];
              if (bc && val) {
                const label = val;
                if (label) {
                  const tw = doc.getTextWidth(label);
                  const bw = Math.min(tw + 5, cell.width - 4);
                  const bx = cell.x + (cell.width - bw) / 2;
                  doc.setFillColor(bc[0], bc[1], bc[2]);
                  doc.roundedRect(bx, cell.y + 1, bw, cell.height - 2, 0.5, 0.5, 'F');
                  doc.setTextColor(255, 255, 255);
                  doc.setFontSize(5.5);
                  doc.text(label, cell.x + cell.width / 2, cell.y + cell.height / 2 + 1, { align: 'center' });
                  doc.setFontSize(6.5);
                }
              }
            }
            if (northStarIdx >= 0 && data.column.index === northStarIdx) {
              const val = (data.cell.raw ?? '').toString().trim().toLowerCase();
              const dot: Record<string, [number, number, number]> = {
                northstar: [46, 125, 50], candidatenorthstar: [245, 127, 23],
                disputednorthstar: [21, 101, 192],
              };
              const c = dot[val];
              if (c) {
                doc.setFillColor(c[0], c[1], c[2]);
                doc.circle(cell.x + 2.5, cell.y + cell.height / 2, 1.3, 'F');
              }
            }
          },
        });
        doc.setTextColor(0);

        const pageAfterTable = doc.getNumberOfPages();
        const finalY = (doc as any).lastAutoTable?.finalY;
        const tableSpannedPages = pageAfterTable > pageBeforeTable;
        console.debug('PDF TABLE:', JSON.stringify({
          name: item.displayName, num: item.number,
          startPage: pageBeforeTable, endPage: pageAfterTable,
          tableStartY, finalY, pageHeight,
          tableSpannedPages, margin,
          tableEndCursorY,
        }));
        if (tableEndCursorY != null && tableEndCursorY >= margin && tableEndCursorY < pageHeight - 5) {
          yPos = tableEndCursorY;
        } else if (!tableSpannedPages && finalY != null && finalY > tableStartY && finalY < pageHeight - 5) {
          yPos = finalY;
        } else {
          yPos = Math.max(tableStartY + 8, margin + 8);
        }
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0);
        doc.setCharSpace(0);
        yPos += lhMm(10);
        if (yPos > pageHeight - margin - 15) {
          doc.addPage();
          yPos = margin;
        }
      }

      // -- Services list --
      if (item.services.length > 0) {
        if (yPos + lhMm(10) * 2 > pageHeight - margin) {
          doc.addPage();
          yPos = margin;
        }
        yPos += lhMm(10) / 2;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Services:', margin, yPos);
        yPos += lhMm(10);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        for (const svc of item.services) {
          const nameHeight = lhMm(8);
          const descHeight = svc.description ? lhMm(8) : 0;
          if (yPos + nameHeight + descHeight > pageHeight - margin) {
            doc.addPage();
            yPos = margin;
          }
          doc.setFont('helvetica', 'bold');
          doc.text(`• ${svc.displayName}`, margin + 4, yPos);
          yPos += nameHeight;
          if (svc.description) {
            doc.setFont('helvetica', 'normal');
            const lines = doc.splitTextToSize(svc.description, contentWidth - margin - 8);
            for (const line of lines) {
              if (yPos + lhMm(7) > pageHeight - margin) {
                doc.addPage();
                yPos = margin;
              }
              doc.text(line, margin + 10, yPos);
              yPos += lhMm(7);
            }
          }
        }
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0);
        doc.setCharSpace(0);
        yPos += lhMm(10);
        if (yPos > pageHeight - margin - 15) {
          doc.addPage();
          yPos = margin;
        }
      }
    }

    // -- Back-fill TOC page numbers --
    for (const layout of tocLayouts) {
      doc.setPage(layout.page);
      doc.setFillColor(255, 255, 255);
      doc.rect(pageWidth - margin - 22, layout.y - 3, 20, 5, 'F');
      doc.setTextColor(0);
      doc.setFontSize(10);
      doc.text(String(layout.entry.page), pageWidth - margin - 3, layout.y, { align: 'right' });
    }

    // -- Save --
    const pdfBlob = doc.output('blob');
    saveAsFn(pdfBlob, 'service-catalog.pdf');
  }

  /** Collect catalog items for PDF export (respects filters), with hierarchical numbering and per-node applications. */
  private _collectPdfTreeItems(
    parentId: string | null,
    depth: number,
    matchingIds: Set<string> | null,
    result: PdfCatalogItem[],
    numbering: number[] = []
  ): void {
    const items = parentId === null
      ? this.serviceCatalogService.rootItems()
      : this.serviceCatalogService.getItemsByParent(parentId);

    let childIndex = 0;
    for (const item of items) {
      const id = item.id ?? '';
      if (!id) continue;
      if (matchingIds && !this.catalogNodeHasMatchingContent(id, matchingIds)) continue;

      const currentNumber = [...numbering, childIndex + 1];
      const caps = this.collectDescendantBusinessCapabilities(id, matchingIds);
      const apps = this.collectDirectApplications(id, matchingIds);
      const svcs = this.collectDirectServices(id, matchingIds);

      result.push({
        displayName: item.displayName ?? '',
        description: item.description ?? '',
        depth,
        number: currentNumber.join('.'),
        businessCapabilities: caps,
        applications: apps,
        services: svcs,
      });

      this._collectPdfTreeItems(id, depth + 1, matchingIds, result, currentNumber);
      childIndex++;
    }
  }

  /** Collect applications linked directly to a catalog node (not descendants). */
  private collectDirectApplications(nodeId: string, matchingIds: Set<string> | null): PdfAppInfo[] {
    const result: PdfAppInfo[] = [];

    const state = this.catalogNodeState().get(nodeId);
    if (state?.loaded) {
      for (const app of state.applications) {
        if (!matchingIds || matchingIds.has(app.id)) {
          const entity = this.catalogAppEntityCache.get(app.id) ?? null;
          result.push({ id: app.id, displayName: app.displayName, entity });
        }
      }
    } else {
      const item = this.serviceCatalogService.getItemById(nodeId);
      if (item) {
        const appsData = (item as any).applications;
        if (appsData?.edges) {
          for (const edge of appsData.edges) {
            const fs = edge.node?.factSheet;
            if (fs) {
              const appId = String(fs['id'] ?? '');
              if (!matchingIds || matchingIds.has(appId)) {
                const entity = this.catalogAppEntityCache.get(appId) ?? null;
                const displayName = String(fs['displayName'] ?? '');
                result.push({ id: appId, displayName, entity });
              }
            }
          }
        }
      }
    }

    return result;
  }

  /** Collect services linked directly to a catalog node (not descendants). */
  private collectDirectServices(nodeId: string, matchingIds: Set<string> | null): PdfServiceInfo[] {
    const result: PdfServiceInfo[] = [];

    const state = this.catalogNodeState().get(nodeId);
    if (state?.loaded) {
      for (const svc of state.services) {
        if (!matchingIds || true) {
          result.push({ id: svc.id, displayName: svc.displayName, description: svc.description });
        }
      }
    } else {
      const item = this.serviceCatalogService.getItemById(nodeId);
      if (item) {
        const servicesData = (item as any).services;
        if (servicesData?.edges) {
          for (const edge of servicesData.edges) {
            const fs = edge.node?.factSheet;
            if (fs) {
              const svcId = String(fs['id'] ?? '');
              const displayName = String(fs['displayName'] ?? '');
              const description = typeof fs['description'] === 'string' ? fs['description'] : undefined;
              result.push({ id: svcId, displayName, description });
            }
          }
        }
      }
    }

    return result;
  }

  /** Collect unique, sorted business capability displayNames from descendant applications of a catalog node. */
  private collectDescendantBusinessCapabilities(nodeId: string, matchingIds: Set<string> | null): string[] {
    const caps = new Set<string>();

    const addFromEntity = (entity: ListEntities200ResponseInner | undefined): void => {
      if (!entity) return;
      for (const bc of entity.relApplicationToBusinessCapability ?? []) {
        const name = bc.displayName ?? bc.fullName ?? bc.id;
        if (name) caps.add(name);
      }
    };

    const state = this.catalogNodeState().get(nodeId);
    if (state?.loaded) {
      for (const app of state.applications) {
        if (!matchingIds || matchingIds.has(app.id)) {
          addFromEntity(this.catalogAppEntityCache.get(app.id));
        }
      }
    } else {
      const item = this.serviceCatalogService.getItemById(nodeId);
      if (item) {
        const appsData = (item as any).applications;
        if (appsData?.edges) {
          for (const edge of appsData.edges) {
            const fs = edge.node?.factSheet;
            if (fs) {
              const appId = String(fs['id'] ?? '');
              if (!matchingIds || matchingIds.has(appId)) {
                addFromEntity(this.catalogAppEntityCache.get(appId));
              }
            }
          }
        }
      }
    }

    const children = this.serviceCatalogService.getItemsByParent(nodeId);
    for (const child of children) {
      const childCaps = this.collectDescendantBusinessCapabilities(child.id ?? '', matchingIds);
      childCaps.forEach((c) => caps.add(c));
    }

    return [...caps].sort();
  }

  /** Export for normal Application list view: single Applications sheet with all columns. */
  private async exportApplicationsExcel(ExcelJSDefault: any, saveAsFn: any, allRows: TableListRow[]): Promise<void> {
    const rows = allRows.filter((r) => r.rowKind === 'application').map((r) => r.entity);
    if (!rows || rows.length === 0) return;

    const baseUrl = window.location.origin;
    const customFields = this.customFields();
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
      northStarClassification: {
        header: 'North Star',
        value: (row) => String((row as unknown as Record<string, unknown>)['northStarClassification'] ?? ''),
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

    Object.entries(customFields).forEach(([key, def]) => {
      const header = def.label?.['en'] ?? def.label?.[Object.keys(def.label)[0]] ?? key;
      columnSerializers[key] = {
        header,
        value: (row) => {
          const val = row[key as keyof ListEntities200ResponseInner];
          if (val == null) return '';
          if (def.type === 'selectMultiple' && Array.isArray(val)) {
            return val.join(', ');
          }
          return String(val);
        },
      };
    });

    const forcedColumns = ['lifecycle', 'northStarClassification', 'displayName'];
    const visibleColumns = [
      ...forcedColumns,
      ...this.displayedColumns.filter((c) => c !== 'actions' && columnSerializers[c] && !forcedColumns.includes(c)),
    ];

    const wb = new ExcelJSDefault.Workbook();
    const ws = wb.addWorksheet('Applications');

    const headers = ['ID', ...visibleColumns.map((c) => columnSerializers[c].header), 'ZenEA'];
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true };

    ws.getColumn(1).hidden = true;

    rows.forEach((row) => {
      const entityId = (row.id ?? '').trim();
      const hasValidId = entityId.length > 0 && !entityId.startsWith('stacked_');
      const values: (string | { text: string; hyperlink: string })[] = [
        entityId,
        ...visibleColumns.map((colId) => columnSerializers[colId].value(row)),
        hasValidId
          ? { text: 'Open', hyperlink: `${baseUrl}${this.userConfig.projectUrlString(`entity/Application/${entityId}`)}` }
          : '',
      ];
      ws.addRow(values);
    });

    const cellAlign: Partial<ExcelJS.Alignment> = { wrapText: true, vertical: 'top' };
    ws.eachRow((excelRow: any) => {
      excelRow.alignment = cellAlign;
    });

    const linkColIdx = headers.length;
    ws.getColumn(linkColIdx).eachCell({ includeEmpty: false }, (cell: any, rowNumber: number) => {
      if (rowNumber > 1 && typeof cell.value === 'object' && cell.value && 'hyperlink' in cell.value) {
        cell.font = { color: { argb: 'FF0563C1' }, underline: true };
      }
    });

    const CHAR_WIDTH = 1.2;
    const MIN_COL_WIDTH = 8;
    const MAX_COL_WIDTH = 60;
    ws.columns.forEach((col: any) => {
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
      'applications.xlsx'
    );
  }

  /** Export for Service Catalog view: Catalog tree sheet + Applications sheet with catalog context. */
  private async exportCatalogCatalogView(ExcelJSDefault: any, saveAsFn: any, allRows: TableListRow[]): Promise<void> {
    const filters = this.currentFilters();
    const hasActiveFilters = !!(filters.name || filters.technicalSuitability || filters.functionalSuitability ||
      filters.lxTimeClassification || filters.northStarClassification || filters.businessCriticality ||
      filters.relApplicationToBusinessCapability || filters.relApplicationToUserGroup ||
      filters.relApplicationToProject || filters.relApplicationToDataProduct || filters.platformTEMP ||
      (filters.tags && filters.tags.length > 0) ||
      (filters.customFields && Object.keys(filters.customFields).length > 0));
    const matchingIds = hasActiveFilters
      ? new Set(this.applicationsService.applyFilters({ ...filters }).map(a => a.id))
      : null;

    this.populateCatalogAppEntityCache();

    const baseUrl = window.location.origin;
    const wb = new ExcelJSDefault.Workbook();

    // -- Sheet 1: Catalog tree (all nodes regardless of expand/collapse) --
    const catWs = wb.addWorksheet('Catalog');
    catWs.addRow(['Name', 'Description', 'Applications', 'Services']).font = { bold: true };

    this._appendFullCatalogTree(catWs, null, 0, matchingIds);

    const wrapTopAlign: Partial<ExcelJS.Alignment> = { wrapText: true, vertical: 'top' };
    catWs.eachRow((excelRow: any) => { excelRow.alignment = wrapTopAlign; });
    catWs.getColumn(1).width = 50;
    catWs.getColumn(2).width = 40;
    catWs.getColumn(3).width = 60;
    catWs.getColumn(4).width = 60;

    // -- Sheet 2: Applications --
    const customFields = this.customFields();
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
      northStarClassification: {
        header: 'North Star',
        value: (row) => String((row as unknown as Record<string, unknown>)['northStarClassification'] ?? ''),
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

    // Add custom field serializers
    Object.entries(customFields).forEach(([key, def]) => {
      const header = def.label?.['en'] ?? def.label?.[Object.keys(def.label)[0]] ?? key;
      columnSerializers[key] = {
        header,
        value: (row) => {
          const val = row[key as keyof ListEntities200ResponseInner];
          if (val == null) return '';
          if (def.type === 'selectMultiple' && Array.isArray(val)) {
            return val.join(', ');
          }
          return String(val);
        },
      };
    });

    const forcedColumns = ['lifecycle', 'northStarClassification', 'displayName'];
    const visibleColumns = [
      ...forcedColumns,
      ...this.displayedColumns.filter((c) => c !== 'actions' && columnSerializers[c] && !forcedColumns.includes(c)),
    ];

    const appWs = wb.addWorksheet('Applications');

    const headers = ['ID', ...visibleColumns.map((c) => columnSerializers[c].header), 'Service Catalog', 'ZenEA'];
    const headerRow = appWs.addRow(headers);
    headerRow.font = { bold: true };

    appWs.getColumn(1).hidden = true;

    const catalogApps = this._collectFullCatalogApps(null, [], matchingIds);
    for (const { entity, catalogPath } of catalogApps) {
      if (!entity) continue;
      const entityId = (entity.id ?? '').trim();
      const hasValidId = entityId.length > 0 && !entityId.startsWith('stacked_');
      const values: (string | { text: string; hyperlink: string })[] = [
        entityId,
        ...visibleColumns.map((colId) => columnSerializers[colId].value(entity)),
        catalogPath,
        hasValidId
          ? { text: 'Open', hyperlink: `${baseUrl}${this.userConfig.projectUrlString(`entity/Application/${entityId}`)}` }
          : '',
      ];
      appWs.addRow(values);
    }

    const cellAlign: Partial<ExcelJS.Alignment> = { wrapText: true, vertical: 'top' };
    appWs.eachRow((excelRow: any) => {
      excelRow.alignment = cellAlign;
    });

    const catalogColIdx = headers.length - 1;
    const linkColIdx = headers.length;
    appWs.getColumn(linkColIdx).eachCell({ includeEmpty: false }, (cell: any, rowNumber: number) => {
      if (rowNumber > 1 && typeof cell.value === 'object' && cell.value && 'hyperlink' in cell.value) {
        cell.font = { color: { argb: 'FF0563C1' }, underline: true };
      }
    });

    const CHAR_WIDTH = 1.2;
    const MIN_COL_WIDTH = 8;
    const MAX_COL_WIDTH = 60;
    appWs.columns.forEach((col: any) => {
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
      'service-catalog.xlsx'
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
    const params: Record<string, string | null> = {
      [QP.view]: this.serviceCatalogView() ? 'ServiceCatalog' : null,
      [QP.name]: filters.name?.trim() || null,
      [QP.techSuit]: filters.technicalSuitability || null,
      [QP.bizSuit]: filters.functionalSuitability || null,
      [QP.timeClass]: filters.lxTimeClassification || null,
      [QP.northStar]: filters.northStarClassification || null,
      [QP.bizCrit]: filters.businessCriticality || null,
      [QP.bizCap]: filters.relApplicationToBusinessCapability || null,
      [QP.userGroup]: filters.relApplicationToUserGroup || null,
      [QP.project]: filters.relApplicationToProject || null,
      [QP.dataProduct]: filters.relApplicationToDataProduct || null,
      [QP.platformTEMP]: filters.platformTEMP || null,
      [QP.tags]: filters.tags && filters.tags.length > 0 ? filters.tags.join(',') : null,
      [QP.tagGroups]: filters.tagGroups && filters.tagGroups.length > 0 ? filters.tagGroups.join(',') : null,
      [QP.customFields]: filters.customFields && Object.keys(filters.customFields).length > 0 ? JSON.stringify(filters.customFields) : null,
      [QP.customFieldIds]: filters.customFieldIds && filters.customFieldIds.length > 0 ? filters.customFieldIds.join(',') : null,
    };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.currentFilters.set(filters);
    this.initialFilters.set(filters);
    if (this.serviceCatalogView()) {
      this._autoExpandDone = false;
      this.rebuildCatalogRows();
    } else {
      this.applyFiltersToTable();
    }
  }

  onMapCountryClicked(event: { isoCode: string; userGroupId: string }): void {
    const allGroups = this.userGroupsDataService.data();
    const groupById = new Map(allGroups.map((g: any) => [g.id, g]));
    let current: any = groupById.get(event.userGroupId);
    while (current && current.category !== 'region') {
      current = current.parent ? groupById.get(current.parent) : null;
    }
    if (!current) return;
    const filters = this.currentFilters();
    this.onFiltersChange({ ...filters, relApplicationToUserGroup: current.displayName });
  }

  /** Apply current filters to the cached applications and update the table data. */
  private applyFiltersToTable(): void {
    const filters = this.currentFilters();
    let filteredApps: ApplicationItem[];

    if (this.serviceCatalogView()) {
      filteredApps = this.applicationsService.applications();
    } else {
      filteredApps = this.applicationsService.applyFilters({
        name: filters.name,
        technicalSuitability: filters.technicalSuitability,
        functionalSuitability: filters.functionalSuitability,
        lxTimeClassification: filters.lxTimeClassification,
        northStarClassification: filters.northStarClassification,
        businessCriticality: filters.businessCriticality,
        relApplicationToBusinessCapability: filters.relApplicationToBusinessCapability,
        relApplicationToUserGroup: filters.relApplicationToUserGroup,
        relApplicationToProject: filters.relApplicationToProject,
        relApplicationToDataProduct: filters.relApplicationToDataProduct,
        platformTEMP: filters.platformTEMP,
        tags: filters.tags,
        customFields: filters.customFields,
      });
    }

    if (this.stackAppsEnabled()) {
      filteredApps = stackApplications(filteredApps) as ApplicationItem[];
    }

    const tableRows: TableListRow[] = filteredApps.map((app) => {
      const row: TableListRow = {
        rowKind: 'application',
        uid: `app-${app.id}`,
        entity: this.applicationItemToEntity(app),
      };
      if (this.stackAppsEnabled() && 'stackedApplications' in app) {
        row.stackedCount = (app as any).stackedApplications?.length;
      }
      return row;
    });

    this.unifiedTableData.set(tableRows);
    this.displayedCount.set(tableRows.length);
    this.loading.set(false);
  }

  private applicationItemToEntity(app: ApplicationItem): ListEntities200ResponseInner {
    // Spread all properties from app (preserves custom fields)
    const result: Record<string, unknown> = { ...app };
    // Ensure type is set correctly (use bracket notation for index signature)
    result['type'] = 'Application';
    // Map relation fields to the format expected by ListEntities200ResponseInner
    result['migrationTarget'] = (app.migrationTarget ?? []).map((m) => ({
      id: m.id,
      type: 'Application',
      displayName: m.displayName,
    }));
    result['alternatives'] = (app.alternatives ?? []).map((a) => ({
      id: a.id,
      type: 'Application',
      displayName: a.displayName,
    }));
    result['relApplicationToBusinessCapability'] = (app.relApplicationToBusinessCapability ?? []).map((c) => ({
      id: c.id,
      displayName: c.displayName,
      fullName: c.fullName ?? c.displayName,
      type: 'BusinessCapability',
      description: '',
    }));
    result['relApplicationToUserGroup'] = (app.relApplicationToUserGroup ?? []).map((g) => ({
      id: g.id,
      displayName: g.displayName,
      fullName: g.fullName ?? g.displayName,
      type: 'UserGroup',
      description: '',
    }));
    result['relApplicationToDataProduct'] = (app.relApplicationToDataProduct ?? []).map((p) => ({
      id: p.id,
      displayName: p.displayName,
      fullName: p.fullName ?? p.displayName,
      type: 'DataProduct',
      description: '',
    }));
    result['tags'] = (app.tags ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      description: t.description,
      tagGroup: t.tagGroupId ? { id: t.tagGroupId } : null,
    }));
    return result as unknown as ListEntities200ResponseInner;
  }

  private entityToApplicationItem(entity: ListEntities200ResponseInner): ApplicationItem {
    const result: Record<string, unknown> = { ...entity };
    result['relApplicationToUserGroup'] = (entity.relApplicationToUserGroup ?? []).map((g) => ({
      id: g.id,
      displayName: g.displayName,
      fullName: g.fullName ?? g.displayName,
    }));
    result['relApplicationToBusinessCapability'] = (entity.relApplicationToBusinessCapability ?? []).map((c) => ({
      id: c.id,
      displayName: c.displayName,
      fullName: c.fullName ?? c.displayName,
    }));
    result['relApplicationToDataProduct'] = (entity.relApplicationToDataProduct ?? []).map((p) => ({
      id: p.id,
      displayName: p.displayName,
      fullName: p.fullName ?? p.displayName,
    }));
    return result as unknown as ApplicationItem;
  }

  /** Clear list and show loading spinner (e.g. before branch switch). */
  private showLoadingState(): void {
    this.loading.set(true);
    this.error.set(null);
    this.entities.set([]);
    this.allEntities.set([]);
    this.unifiedTableData.set([]);
    this.displayedCount.set(0);
  }
}
