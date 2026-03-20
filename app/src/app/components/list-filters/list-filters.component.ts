import {
  Component,
  signal,
  computed,
  inject,
  input,
  output,
  effect,
  OnInit,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule, MatButtonToggleChange } from '@angular/material/button-toggle';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { FacetsService, FacetRelationItem } from '../../services/FacetsService';
import { PLATFORM_TEMP_VALUES } from '../../models/platform-temp-values';
import { ApplicationsService } from '../../services/ApplicationsService';
import { SUITABILITY_VALUES, CRITICALITY_VALUES } from '../suitability-rating/suitability-rating.component';
import { TIME_CLASSIFICATION_VALUES } from '../time-classification/time-classification.component';
import {
  EntityListFilters,
} from '../../models/entity-list-filters';
import { TranslateModule } from '@ngx-translate/core';

/** Value used in filters to mean "entity has no suitability set" */
export const SUITABILITY_FILTER_EMPTY = 'empty';

const SUITABILITY_LABELS: Record<string, string> = {
  inappropriate: 'Inappropriate',
  unreasonable: 'Unreasonable',
  adequate: 'Adequate',
  fullyAppropriate: 'Fully appropriate',
  [SUITABILITY_FILTER_EMPTY]: 'Empty',
};

const TIME_CLASSIFICATION_LABELS: Record<string, string> = {
  tolerate: 'Tolerate',
  invest: 'Invest',
  migrate: 'Migrate',
  eliminate: 'Eliminate',
  [SUITABILITY_FILTER_EMPTY]: 'Empty',
};

const CRITICALITY_LABELS: Record<string, string> = {
  administrativeService: 'Administrative service',
  businessOperational: 'Business operational',
  businessCritical: 'Business critical',
  missionCritical: 'Mission critical',
  [SUITABILITY_FILTER_EMPTY]: 'Empty',
};

/** One option in the tree dropdown: id is displayName (filter value), label for display text, depth for CSS indent, trackId for unique tracking */
export interface FacetTreeOption {
  id: string;
  label: string;
  depth: number;
  trackId?: string;
}

interface TreeNode {
  segment: string;
  itemId?: string;
  /** Full displayName (path) for the leaf, used as filter value. */
  itemDisplayName?: string;
  children: Map<string, TreeNode>;
}

function pathSegments(displayName: string): string[] {
  if (!displayName || typeof displayName !== 'string') return [];
  return displayName
    .split(/\s*\/\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildTree(items: FacetRelationItem[]): TreeNode {
  const root: TreeNode = { segment: '', children: new Map() };
  for (const item of items) {
    const name = item.displayName ?? item.fullName ?? item.id ?? '';
    const path = pathSegments(name);
    if (path.length === 0) continue;
    let current = root;
    for (let i = 0; i < path.length; i++) {
      const seg = path[i];
      if (!current.children.has(seg)) {
        current.children.set(seg, { segment: seg, children: new Map() });
      }
      current = current.children.get(seg)!;
      if (i === path.length - 1) {
        current.itemId = item.id;
        current.itemDisplayName = name;
      }
    }
  }
  return root;
}

function flattenTree(
  node: TreeNode,
  depth: number,
  out: FacetTreeOption[]
): void {
  const sorted = [...node.children.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { sensitivity: 'base' })
  );
  for (const [, child] of sorted) {
    const prefix = depth > 0 ? '| ' : '';
    const label = prefix + child.segment;
    if (child.itemId != null) {
      out.push({
        id: child.itemDisplayName ?? child.segment,
        label,
        depth,
        trackId: child.itemId,
      });
    }
    flattenTree(child, depth + 1, out);
  }
}

function buildTreeOptions(
  items: FacetRelationItem[],
  filterText: string
): FacetTreeOption[] {
  const trimmed = filterText ? filterText.trim().toLowerCase() : '';
  const filtered = trimmed
    ? items.filter((item) => {
        const name = (item.displayName ?? item.fullName ?? '').toLowerCase();
        return name.includes(trimmed);
      })
    : items;
  const source = filtered.length > 0 || !trimmed ? filtered : items;
  const tree = buildTree(source);
  const out: FacetTreeOption[] = [];
  flattenTree(tree, 0, out);
  return out;
}

@Component({
  selector: 'app-list-filters',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatButtonToggleModule,
    MatSelectModule,
    NgxMatSelectSearchModule,
    TranslateModule,
  ],
  templateUrl: './list-filters.component.html',
  styleUrl: './list-filters.component.scss',
})
export class ListFiltersComponent implements OnInit {
  /** Initial filter values (e.g. from URL). Applied once when set. */
  initialFilters = input<Partial<EntityListFilters>>({});

  /** Emits the full filter state whenever any filter changes. */
  filtersChange = output<EntityListFilters>();

  private facetsService = inject(FacetsService);
  /** Injected so applications are loaded on boot (with facets) for use in entity edit. */
  private applicationsService = inject(ApplicationsService);
  private destroyRef = inject(DestroyRef);

  readonly suitabilityValues = [...SUITABILITY_VALUES, SUITABILITY_FILTER_EMPTY];
  readonly suitabilityLabels = SUITABILITY_LABELS;
  readonly timeClassificationValues = [...TIME_CLASSIFICATION_VALUES, SUITABILITY_FILTER_EMPTY];
  readonly timeClassificationLabels = TIME_CLASSIFICATION_LABELS;
  readonly criticalityValues = [...CRITICALITY_VALUES, SUITABILITY_FILTER_EMPTY];
  readonly criticalityLabels = CRITICALITY_LABELS;

  nameFilterInput = signal('');
  /** Debounced name filter (emitted in filters); updated 200ms after input changes. */
  private appliedNameFilter = signal('');
  private nameFilterSubject = new Subject<string>();
  technicalSuitabilityFilter = signal<string>('');
  functionalSuitabilityFilter = signal<string>('');
  timeClassificationFilter = signal<string>('');
  businessCriticalityFilter = signal<string>('');
  filterRelApplicationToBusinessCapability = signal<string>('');
  filterRelApplicationToUserGroup = signal<string>('');
  filterRelApplicationToProject = signal<string>('');
  filterPlatformTEMP = signal<string>('');

  businessCapabilityFilterCtrl = new FormControl<string>('', { nonNullable: true });
  userGroupFilterCtrl = new FormControl<string>('', { nonNullable: true });
  projectFilterCtrl = new FormControl<string>('', { nonNullable: true });
  platformTempFilterCtrl = new FormControl<string>('', { nonNullable: true });

  private businessCapabilityFilterValue = toSignal(
    this.businessCapabilityFilterCtrl.valueChanges.pipe(startWith('')),
    { initialValue: '' }
  );
  private userGroupFilterValue = toSignal(
    this.userGroupFilterCtrl.valueChanges.pipe(startWith('')),
    { initialValue: '' }
  );
  private projectFilterValue = toSignal(
    this.projectFilterCtrl.valueChanges.pipe(startWith('')),
    { initialValue: '' }
  );

  private platformTempFilterValue = toSignal(
    this.platformTempFilterCtrl.valueChanges.pipe(startWith('')),
    { initialValue: '' }
  );

  private technicalSuitabilityChanged = false;
  private functionalSuitabilityChanged = false;
  private timeClassificationChanged = false;
  private businessCriticalityChanged = false;
  private platformTempChanged = false;

  /** Ensures we only apply initialFilters once (from URL), so user edits are not overwritten. */
  private initialFiltersApplied = false;

  businessCapabilityOptions = computed(() => {
    this.facetsService.data();
    const items = this.facetsService.getFacet(
      'relApplicationToBusinessCapability'
    ) as FacetRelationItem[] | null;
    return Array.isArray(items) ? items : [];
  });

  userGroupOptions = computed(() => {
    this.facetsService.data();
    const items = this.facetsService.getFacet(
      'relApplicationToUserGroup'
    ) as FacetRelationItem[] | null;
    return Array.isArray(items) ? items : [];
  });

  businessCapabilityOptionsTree = computed(() =>
    buildTreeOptions(
      this.businessCapabilityOptions(),
      this.businessCapabilityFilterValue()
    )
  );

  userGroupOptionsTree = computed(() =>
    buildTreeOptions(
      this.userGroupOptions(),
      this.userGroupFilterValue()
    )
  );

  projectFilteredOptions = computed(() => {
    const list = this.projectOptions();
    const q = this.projectFilterValue().trim().toLowerCase();
    const selectedDisplayName = this.filterRelApplicationToProject();
    const displayNameFor = (item: FacetRelationItem) =>
      item.displayName ?? item.fullName ?? item.id ?? '';
    let filtered = !q
      ? list
      : list.filter((item) =>
          displayNameFor(item).toLowerCase().includes(q)
        );
    if (
      selectedDisplayName &&
      !filtered.some((item) => displayNameFor(item) === selectedDisplayName)
    ) {
      const selected = list.find(
        (item) => displayNameFor(item) === selectedDisplayName
      );
      if (selected) filtered = [selected, ...filtered];
    }
    return filtered;
  });

  projectOptions = computed(() => {
    this.facetsService.data();
    const items = this.facetsService.getFacet(
      'relApplicationToProject'
    ) as FacetRelationItem[] | null;
    return Array.isArray(items) ? items : [];
  });

  platformTempOptions = computed(() => {
    this.facetsService.data();
    const raw = this.facetsService.getFacet('platformTEMP');
    if (Array.isArray(raw) && raw.every((v) => typeof v === 'string')) {
      return (raw as string[]).slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }
    return PLATFORM_TEMP_VALUES.slice();
  });

  platformTempFilteredOptions = computed(() => {
    const list = this.platformTempOptions();
    const q = this.platformTempFilterValue().trim().toLowerCase();
    if (!q) return list;
    return list.filter((v) => v.toLowerCase().includes(q));
  });

  constructor() {
    this.nameFilterSubject
      .pipe(debounceTime(200), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.appliedNameFilter.set(value.trim());
        this.emitFilters();
      });

    effect(() => {
      const init = this.initialFilters();
      if (!init || Object.keys(init).length === 0) return;
      if (this.initialFiltersApplied) return;
      this.initialFiltersApplied = true;

      if (init.name !== undefined) {
        this.nameFilterInput.set(init.name);
        this.appliedNameFilter.set(init.name);
        this.nameFilterSubject.next(init.name);
      }
      if (
        init.technicalSuitability !== undefined &&
        (SUITABILITY_VALUES.includes(init.technicalSuitability as (typeof SUITABILITY_VALUES)[number]) ||
          init.technicalSuitability === SUITABILITY_FILTER_EMPTY)
      ) {
        this.technicalSuitabilityFilter.set(init.technicalSuitability);
      }
      if (
        init.functionalSuitability !== undefined &&
        (SUITABILITY_VALUES.includes(init.functionalSuitability as (typeof SUITABILITY_VALUES)[number]) ||
          init.functionalSuitability === SUITABILITY_FILTER_EMPTY)
      ) {
        this.functionalSuitabilityFilter.set(init.functionalSuitability);
      }
      if (
        init.lxTimeClassification !== undefined &&
        (TIME_CLASSIFICATION_VALUES.includes(init.lxTimeClassification as (typeof TIME_CLASSIFICATION_VALUES)[number]) ||
          init.lxTimeClassification === SUITABILITY_FILTER_EMPTY)
      ) {
        this.timeClassificationFilter.set(init.lxTimeClassification);
      }
      if (
        init.businessCriticality !== undefined &&
        (CRITICALITY_VALUES.includes(init.businessCriticality as (typeof CRITICALITY_VALUES)[number]) ||
          init.businessCriticality === SUITABILITY_FILTER_EMPTY)
      ) {
        this.businessCriticalityFilter.set(init.businessCriticality);
      }
      if (init.relApplicationToBusinessCapability !== undefined) {
        this.filterRelApplicationToBusinessCapability.set(
          init.relApplicationToBusinessCapability
        );
        this.businessCapabilityFilterCtrl.setValue('', { emitEvent: false });
      }
      if (init.relApplicationToUserGroup !== undefined) {
        this.filterRelApplicationToUserGroup.set(init.relApplicationToUserGroup);
        this.userGroupFilterCtrl.setValue('', { emitEvent: false });
      }
      if (init.relApplicationToProject !== undefined) {
        this.filterRelApplicationToProject.set(init.relApplicationToProject);
        this.projectFilterCtrl.setValue('', { emitEvent: false });
      }
      if (init.platformTEMP !== undefined) {
        this.filterPlatformTEMP.set(init.platformTEMP);
        this.platformTempFilterCtrl.setValue('', { emitEvent: false });
      }
      this.emitFilters();
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.emitFilters();
  }

  getCurrentFilters(): EntityListFilters {
    return {
      name: this.appliedNameFilter().trim(),
      technicalSuitability: this.technicalSuitabilityFilter(),
      functionalSuitability: this.functionalSuitabilityFilter(),
      lxTimeClassification: this.timeClassificationFilter(),
      businessCriticality: this.businessCriticalityFilter(),
      relApplicationToBusinessCapability:
        this.filterRelApplicationToBusinessCapability(),
      relApplicationToUserGroup: this.filterRelApplicationToUserGroup(),
      relApplicationToProject: this.filterRelApplicationToProject(),
      platformTEMP: this.filterPlatformTEMP(),
    };
  }

  private emitFilters(): void {
    this.filtersChange.emit(this.getCurrentFilters());
  }

  onNameFilterInputChange(value: string): void {
    this.nameFilterInput.set(value);
    this.nameFilterSubject.next(value);
  }

  clearNameFilter(): void {
    this.nameFilterInput.set('');
    this.nameFilterSubject.next('');
    this.appliedNameFilter.set('');
    this.emitFilters();
  }

  onTechnicalSuitabilityChange(change: MatButtonToggleChange): void {
    this.technicalSuitabilityChanged = true;
    this.technicalSuitabilityFilter.set(change.value ?? '');
    this.emitFilters();
  }

  onTechnicalSuitabilityClick(): void {
    if (!this.technicalSuitabilityChanged) {
      this.technicalSuitabilityFilter.set('');
      this.emitFilters();
    }
    this.technicalSuitabilityChanged = false;
  }

  onFunctionalSuitabilityChange(change: MatButtonToggleChange): void {
    this.functionalSuitabilityChanged = true;
    this.functionalSuitabilityFilter.set(change.value ?? '');
    this.emitFilters();
  }

  onFunctionalSuitabilityClick(): void {
    if (!this.functionalSuitabilityChanged) {
      this.functionalSuitabilityFilter.set('');
      this.emitFilters();
    }
    this.functionalSuitabilityChanged = false;
  }

  onTimeClassificationChange(change: MatButtonToggleChange): void {
    this.timeClassificationChanged = true;
    this.timeClassificationFilter.set(change.value ?? '');
    this.emitFilters();
  }

  onTimeClassificationClick(): void {
    if (!this.timeClassificationChanged) {
      this.timeClassificationFilter.set('');
      this.emitFilters();
    }
    this.timeClassificationChanged = false;
  }

  onBusinessCriticalityChange(change: MatButtonToggleChange): void {
    this.businessCriticalityChanged = true;
    this.businessCriticalityFilter.set(change.value ?? '');
    this.emitFilters();
  }

  onBusinessCriticalityClick(): void {
    if (!this.businessCriticalityChanged) {
      this.businessCriticalityFilter.set('');
      this.emitFilters();
    }
    this.businessCriticalityChanged = false;
  }

  onPlatformTempChange(value: string): void {
    this.platformTempChanged = true;
    this.filterPlatformTEMP.set(value ?? '');
    this.platformTempFilterCtrl.setValue('', { emitEvent: false });
    this.emitFilters();
  }

  onBusinessCapabilityChange(value: string): void {
    this.filterRelApplicationToBusinessCapability.set(value ?? '');
    this.businessCapabilityFilterCtrl.setValue('', { emitEvent: false });
    this.emitFilters();
  }

  onUserGroupChange(value: string): void {
    this.filterRelApplicationToUserGroup.set(value ?? '');
    this.userGroupFilterCtrl.setValue('', { emitEvent: false });
    this.emitFilters();
  }

  onProjectChange(value: string): void {
    this.filterRelApplicationToProject.set(value ?? '');
    this.projectFilterCtrl.setValue('', { emitEvent: false });
    this.emitFilters();
  }
}
