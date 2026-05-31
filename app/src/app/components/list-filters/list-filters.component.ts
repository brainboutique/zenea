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
  Input,
  ViewEncapsulation,
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
import { MatMenuModule } from '@angular/material/menu';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { FacetsService, FacetRelationItem } from '../../services/FacetsService';
import { PLATFORM_TEMP_VALUES } from '../../models/platform-temp-values';
import { ApplicationsService } from '../../services/ApplicationsService';
import { TagsService, TagGroupItem, TagItem } from '../../services/TagsService';
import { ModelDefinitionsService, CustomFieldDefinition } from '../../services/model-definitions.service';
import { SUITABILITY_VALUES, CRITICALITY_VALUES } from '../suitability-rating/suitability-rating.component';
import { TIME_CLASSIFICATION_VALUES } from '../time-classification/time-classification.component';
import { NORTH_STAR_CLASSIFICATION_VALUES } from '../north-star-classification/north-star-classification.component';
import {
  EntityListFilters,
} from '../../models/entity-list-filters';
import { TranslateModule } from '@ngx-translate/core';
import { ActivatedRoute } from '@angular/router';

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

const NORTH_STAR_CLASSIFICATION_LABELS: Record<string, string> = {
  northStar: 'North Star',
  candidateNorthStar: 'Candidate',
  disputedNorthStar: 'Disputed',
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
    MatMenuModule,
    NgxMatSelectSearchModule,
    TranslateModule,
  ],
  templateUrl: './list-filters.component.html',
  styleUrl: './list-filters.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ListFiltersComponent implements OnInit {
  /** Initial filter values (e.g. from URL). Applied once when set. */
  @Input() set initialFilters(value: Partial<EntityListFilters>) {
    if (value && Object.keys(value).length > 0 && !this.initialFiltersApplied) {
      this._initialFilters = value;
      this.tryApplyInitialFilters();
    }
    this._initialFilters = value;
    this._filterUpdates.set({ ...value });
  }
  private _initialFilters: Partial<EntityListFilters> = {};
  private _filterUpdates = signal<Partial<EntityListFilters> | null>(null);

  constructor() {
    this.nameFilterSubject
      .pipe(debounceTime(200), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.appliedNameFilter.set(value.trim());
        this.emitFilters();
      });

    effect(() => {
      const updates = this._filterUpdates();
      if (!updates || !this.initialFiltersApplied) return;
      if (updates.relApplicationToUserGroup !== undefined) {
        this.filterRelApplicationToUserGroup.set(updates.relApplicationToUserGroup);
        this.userGroupFilterCtrl.setValue('', { emitEvent: false });
      }
      if (updates.relApplicationToBusinessCapability !== undefined) {
        this.filterRelApplicationToBusinessCapability.set(updates.relApplicationToBusinessCapability);
        this.businessCapabilityFilterCtrl.setValue('', { emitEvent: false });
      }
      if (updates.relApplicationToDataProduct !== undefined) {
        this.filterRelApplicationToDataProduct.set(updates.relApplicationToDataProduct);
        this.dataProductFilterCtrl.setValue('', { emitEvent: false });
      }
      if (updates.relApplicationToProject !== undefined) {
        this.filterRelApplicationToProject.set(updates.relApplicationToProject);
        this.projectFilterCtrl.setValue('', { emitEvent: false });
      }
      if (updates.platformTEMP !== undefined) {
        this.filterPlatformTEMP.set(updates.platformTEMP);
        this.platformTempFilterCtrl.setValue('', { emitEvent: false });
      }
    });
  }

  /** Emits the full filter state whenever any filter changes. */
  filtersChange = output<EntityListFilters>();
  /** Emits when user clicks the "Before stacking" count to unstack all rows. */
  unstackAllStackedApps = output<void>();

  /** Number of application rows currently displayed in the list. */
  displayedAppsCount = input<number>(0);
  /** Number of matching applications before stacking is applied. */
  fullAppsCountBeforeStacking = input<number>(0);
  /** Whether at least one stacked row is currently visible. */
  hasStackedApps = input<boolean>(false);

  private facetsService = inject(FacetsService);
  /** Injected so applications are loaded on boot (with facets) for use in entity edit. */
  private applicationsService = inject(ApplicationsService);
  private tagsService = inject(TagsService);
  private modelDefinitionsService = inject(ModelDefinitionsService);
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);

  readonly suitabilityValues = [...SUITABILITY_VALUES, SUITABILITY_FILTER_EMPTY];
  readonly suitabilityLabels = SUITABILITY_LABELS;
  readonly timeClassificationValues = [...TIME_CLASSIFICATION_VALUES, SUITABILITY_FILTER_EMPTY];
  readonly timeClassificationLabels = TIME_CLASSIFICATION_LABELS;
  readonly criticalityValues = [...CRITICALITY_VALUES, SUITABILITY_FILTER_EMPTY];
  readonly criticalityLabels = CRITICALITY_LABELS;
  readonly northStarClassificationValues = [...NORTH_STAR_CLASSIFICATION_VALUES, SUITABILITY_FILTER_EMPTY];
  readonly northStarClassificationLabels = NORTH_STAR_CLASSIFICATION_LABELS;

  nameFilterInput = signal('');
  /** Debounced name filter (emitted in filters); updated 200ms after input changes. */
  private appliedNameFilter = signal('');
  private nameFilterSubject = new Subject<string>();
  technicalSuitabilityFilter = signal<string>('');
  functionalSuitabilityFilter = signal<string>('');
  timeClassificationFilter = signal<string>('');
  northStarClassificationFilter = signal<string>('');
  businessCriticalityFilter = signal<string>('');
  filterRelApplicationToBusinessCapability = signal<string>('');
  filterRelApplicationToUserGroup = signal<string>('');
  filterRelApplicationToProject = signal<string>('');
  filterRelApplicationToDataProduct = signal<string>('');
  filterPlatformTEMP = signal<string>('');

  /** Active tag group filters: each group renders as a row of pill toggles for its tags. */
  activeTagGroupFilters = signal<Array<{ tagGroupId: string | null; groupName: string; tags: TagItem[]; selectedTagId: string }>>([]);

  /** Added tag group IDs (persisted in URL even if no tag selected). */
  addedTagGroupIds = signal<Set<string | null>>(new Set());

  /** Whether initialFilters have been applied. */
  private initialFiltersApplied = false;

  /** Custom field definitions for the Application entity type (loaded async). */
  customFieldDefinitions = signal<Record<string, CustomFieldDefinition>>({});
  private customFieldDefinitionsLoaded = false;

  /** Active custom field filters: each entry renders as a row of pill toggles. */
  activeCustomFieldFilters = signal<Array<{
    fieldName: string;
    label: string;
    type: 'selectSingle' | 'selectMultiple';
    values: string[];
    selectedValue: string;
  }>>([]);

  /** Added custom field IDs (persisted in URL even if no value selected). */
  addedCustomFieldIds = signal<Set<string>>(new Set());

  private customFieldChangedIds = new Set<string>();

  businessCapabilityFilterCtrl = new FormControl<string>('', { nonNullable: true });
  userGroupFilterCtrl = new FormControl<string>('', { nonNullable: true });
  projectFilterCtrl = new FormControl<string>('', { nonNullable: true });
  dataProductFilterCtrl = new FormControl<string>('', { nonNullable: true });
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

  private dataProductFilterValue = toSignal(
    this.dataProductFilterCtrl.valueChanges.pipe(startWith('')),
    { initialValue: '' }
  );

  private platformTempFilterValue = toSignal(
    this.platformTempFilterCtrl.valueChanges.pipe(startWith('')),
    { initialValue: '' }
  );

  private technicalSuitabilityChanged = false;
  private functionalSuitabilityChanged = false;
  private timeClassificationChanged = false;
  private northStarClassificationChanged = false;
  private businessCriticalityChanged = false;
  private platformTempChanged = false;

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

  dataProductOptions = computed(() => {
    this.facetsService.data();
    const items = this.facetsService.getFacet(
      'relApplicationToDataProduct'
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

  tagGroupDropdownOptions = computed(() => {
    this.tagsService.data();
    const groups = this.tagsService.data();
    const addedIds = this.addedTagGroupIds();
    return groups.filter((g) => !addedIds.has(g.id));
  });

  selectCustomFieldDropdownOptions = computed(() => {
    const defs = this.customFieldDefinitions();
    const addedIds = this.addedCustomFieldIds();
    return Object.entries(defs)
      .filter(([key, def]) => (def.type === 'selectSingle' || def.type === 'selectMultiple') && !addedIds.has(key))
      .map(([key, def]) => ({
        fieldName: key,
        label: def.label?.['en'] ?? def.label?.[Object.keys(def.label)[0]] ?? key,
        type: def.type as 'selectSingle' | 'selectMultiple',
        values: def.values ?? [],
      }));
  });

  addCustomFieldFilter(field: { fieldName: string; label: string; type: 'selectSingle' | 'selectMultiple'; values: string[] }): void {
    const current = this.activeCustomFieldFilters();
    if (current.some((f) => f.fieldName === field.fieldName)) return;
    this.activeCustomFieldFilters.set([
      ...current,
      {
        fieldName: field.fieldName,
        label: field.label,
        type: field.type,
        values: field.values,
        selectedValue: '',
      },
    ]);
    this.addedCustomFieldIds.update(set => new Set(set).add(field.fieldName));
    this.emitFilters();
  }

  onCustomFieldPillChange(fieldName: string, value: string): void {
    this.customFieldChangedIds.add(fieldName);
    const current = this.activeCustomFieldFilters();
    const updated = current.map((f) =>
      f.fieldName === fieldName ? { ...f, selectedValue: value } : f
    );
    this.activeCustomFieldFilters.set(updated);
    this.emitFilters();
  }

  onCustomFieldPillClick(fieldName: string): void {
    if (!this.customFieldChangedIds.has(fieldName)) {
      const current = this.activeCustomFieldFilters();
      const updated = current.map((f) =>
        f.fieldName === fieldName ? { ...f, selectedValue: '' } : f
      );
      this.activeCustomFieldFilters.set(updated);
      this.emitFilters();
    }
    this.customFieldChangedIds.delete(fieldName);
  }

  removeCustomFieldFilter(fieldName: string): void {
    this.activeCustomFieldFilters.set(this.activeCustomFieldFilters().filter((f) => f.fieldName !== fieldName));
    this.addedCustomFieldIds.update(set => {
      const next = new Set(set);
      next.delete(fieldName);
      return next;
    });
    this.emitFilters();
  }

  addTagGroupFilter(group: TagGroupItem): void {
    const current = this.activeTagGroupFilters();
    if (current.some((f) => f.tagGroupId === group.id)) return;
    this.activeTagGroupFilters.set([
      ...current,
      {
        tagGroupId: group.id,
        groupName: group.displayName,
        tags: group.tags,
        selectedTagId: '',
      },
    ]);
    this.addedTagGroupIds.update(set => new Set(set).add(group.id));
    this.emitFilters();
  }

  /** Tracks which tag group had its (change) handler fire, so (click) knows whether to toggle off. */
  private tagGroupChangedIds = new Set<string | null>();

  onTagPillChange(tagGroupId: string | null, tagId: string): void {
    this.tagGroupChangedIds.add(tagGroupId);
    const current = this.activeTagGroupFilters();
    const updated = current.map((f) =>
      f.tagGroupId === tagGroupId ? { ...f, selectedTagId: tagId } : f
    );
    this.activeTagGroupFilters.set(updated);
    this.emitFilters();
  }

  onTagPillClick(tagGroupId: string | null): void {
    if (!this.tagGroupChangedIds.has(tagGroupId)) {
      const current = this.activeTagGroupFilters();
      const updated = current.map((f) =>
        f.tagGroupId === tagGroupId ? { ...f, selectedTagId: '' } : f
      );
      this.activeTagGroupFilters.set(updated);
      this.emitFilters();
    }
    this.tagGroupChangedIds.delete(tagGroupId);
  }

  removeTagGroupFilter(tagGroupId: string | null): void {
    this.activeTagGroupFilters.set(this.activeTagGroupFilters().filter((f) => f.tagGroupId !== tagGroupId));
    this.addedTagGroupIds.update(set => {
      const next = new Set(set);
      next.delete(tagGroupId);
      return next;
    });
    this.emitFilters();
  }

  private tryApplyInitialFilters(retryCount = 0): void {
    const init = this._initialFilters;
    if (!init || Object.keys(init).length === 0) return;
    if (this.initialFiltersApplied) return;

    // Apply non-tag filters immediately (only once)
    if (!this.nonTagFiltersApplied) {
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
        init.northStarClassification !== undefined &&
        (NORTH_STAR_CLASSIFICATION_VALUES.includes(init.northStarClassification as (typeof NORTH_STAR_CLASSIFICATION_VALUES)[number]) ||
          init.northStarClassification === SUITABILITY_FILTER_EMPTY)
      ) {
        this.northStarClassificationFilter.set(init.northStarClassification);
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
      if (init.relApplicationToDataProduct !== undefined) {
        this.filterRelApplicationToDataProduct.set(init.relApplicationToDataProduct);
        this.dataProductFilterCtrl.setValue('', { emitEvent: false });
      }
      if (init.platformTEMP !== undefined) {
        this.filterPlatformTEMP.set(init.platformTEMP);
        this.platformTempFilterCtrl.setValue('', { emitEvent: false });
      }
      this.nonTagFiltersApplied = true;
    }

    // Load custom field definitions if not available
    const customDefs = this.customFieldDefinitions();
    const hasCustomDefs = this.customFieldDefinitionsLoaded || Object.keys(customDefs).length > 0 || init.customFieldIds?.length === 0;

    // For tag filters and custom fields: wait for async data to be loaded
    const tagsData = this.tagsService.data();
    const hasTags = (init.tags && init.tags.length > 0) || (init.tagGroups && init.tagGroups.length > 0);
    const hasCustom = init.customFieldIds && init.customFieldIds.length > 0;
    const tagsReady = !hasTags || (tagsData && tagsData.length > 0);
    const customReady = !hasCustom || hasCustomDefs;
    if (!tagsReady || !customReady) {
      if (retryCount < 50) {
        setTimeout(() => this.tryApplyInitialFilters(retryCount + 1), 100);
      }
      return;
    }

    if (init.tagGroups && init.tagGroups.length > 0) {
      this.restoreAddedTagGroups(init.tagGroups);
    }
    if (init.tags && init.tags.length > 0) {
      this.restoreTagFilters(init.tags);
    }
    if (init.customFieldIds && init.customFieldIds.length > 0) {
      this.restoreAddedCustomFields(init.customFieldIds);
    }
    if (init.customFields) {
      this.restoreCustomFieldFilters(init.customFields);
    }
    this.initialFiltersApplied = true;
    this.emitFilters();
  }

  private nonTagFiltersApplied = false;

  /** Restore added tag groups from an array of group IDs (e.g. from URL). */
  private restoreAddedTagGroups(groupIds: string[]): void {
    const groups = this.tagsService.data();
    const existingGroupIds = new Set(this.activeTagGroupFilters().map(f => f.tagGroupId));
    const toAdd = groupIds.filter(id => !existingGroupIds.has(id));
    for (const groupId of toAdd) {
      const group = groups.find(g => g.id === groupId);
      if (!group) continue;
      this.activeTagGroupFilters.update(current => [...current, {
        tagGroupId: group.id,
        groupName: group.displayName,
        tags: group.tags,
        selectedTagId: '',
      }]);
    }
    this.addedTagGroupIds.set(new Set(groupIds.filter(Boolean)));
  }

  /** Restore tag filters from an array of tag IDs (e.g. from URL). */
  private restoreTagFilters(tagIds: string[]): void {
    const allTags = this.tagsService.getAllTags();
    const tagMap = new Map<string, TagItem>();
    for (const tag of allTags) {
      tagMap.set(tag.id, tag);
    }
    const groups = this.tagsService.data();
    const groupMap = new Map<string | null, TagGroupItem>();
    for (const group of groups) {
      groupMap.set(group.id, group);
    }
    const byGroupId = new Map<string | null, string>();
    for (const tagId of tagIds) {
      const tag = tagMap.get(tagId);
      if (!tag) continue;
      if (!byGroupId.has(tag.tagGroupId)) {
        byGroupId.set(tag.tagGroupId, tag.id);
      }
    }
    const restored: Array<{ tagGroupId: string | null; groupName: string; tags: TagItem[]; selectedTagId: string }> = [];
    for (const [groupId, selectedTagId] of byGroupId) {
      const group = groupId ? groupMap.get(groupId) : null;
      if (!group && groupId) continue;
      restored.push({
        tagGroupId: groupId ?? null,
        groupName: group?.displayName ?? 'Ungrouped',
        tags: group?.tags ?? [],
        selectedTagId,
      });
    }
    // Merge with existing filters instead of replacing - tags from URL should
    // select the tag within already-restored groups, not overwrite the groups
    const existing = this.activeTagGroupFilters();
    const existingGroupIds = new Set(existing.map(f => f.tagGroupId));
    const merged = [...existing];
    for (const r of restored) {
      const idx = merged.findIndex(f => f.tagGroupId === r.tagGroupId);
      if (idx >= 0) {
        // Group already exists - just update the selected tag
        merged[idx] = { ...merged[idx], selectedTagId: r.selectedTagId };
      } else {
        // New group from tag filter
        merged.push(r);
      }
    }
    this.activeTagGroupFilters.set(merged);
    // Also track these groups as added
    const restoredGroupIds = restored.map(r => r.tagGroupId).filter(Boolean);
    this.addedTagGroupIds.update(set => {
      const next = new Set(set);
      for (const id of restoredGroupIds) next.add(id);
      return next;
    });
  }

  /** Restore added custom fields from an array of field names (e.g. from URL). */
  private restoreAddedCustomFields(fieldNames: string[]): void {
    const defs = this.customFieldDefinitions();
    const existingNames = new Set(this.activeCustomFieldFilters().map(f => f.fieldName));
    for (const fieldName of fieldNames) {
      if (existingNames.has(fieldName)) continue;
      const def = defs[fieldName];
      if (!def || (def.type !== 'selectSingle' && def.type !== 'selectMultiple')) continue;
      this.activeCustomFieldFilters.update(current => [...current, {
        fieldName,
        label: def.label?.['en'] ?? def.label?.[Object.keys(def.label)[0]] ?? fieldName,
        type: def.type as 'selectSingle' | 'selectMultiple',
        values: def.values ?? [],
        selectedValue: '',
      }]);
    }
    this.addedCustomFieldIds.set(new Set(fieldNames.filter(Boolean)));
  }

  /** Restore custom field filter selections from a map of fieldName → value (e.g. from URL). */
  private restoreCustomFieldFilters(fields: Record<string, string>): void {
    const entries = Object.entries(fields).filter(([, v]) => v);
    if (entries.length === 0) return;
    const existing = this.activeCustomFieldFilters();
    const merged = [...existing];
    for (const [fieldName, value] of entries) {
      const idx = merged.findIndex(f => f.fieldName === fieldName);
      if (idx >= 0) {
        merged[idx] = { ...merged[idx], selectedValue: value };
      } else {
        // Field might not have been added yet — add it
        const def = this.customFieldDefinitions()[fieldName];
        if (def && (def.type === 'selectSingle' || def.type === 'selectMultiple')) {
          merged.push({
            fieldName,
            label: def.label?.['en'] ?? def.label?.[Object.keys(def.label)[0]] ?? fieldName,
            type: def.type as 'selectSingle' | 'selectMultiple',
            values: def.values ?? [],
            selectedValue: value,
          });
        }
      }
    }
    this.activeCustomFieldFilters.set(merged);
    const restoredNames = entries.map(([k]) => k).filter(Boolean);
    this.addedCustomFieldIds.update(set => {
      const next = new Set(set);
      for (const name of restoredNames) next.add(name);
      return next;
    });
  }

  ngOnInit(): void {
    // Do NOT emitFilters() here - the initialFilters and tag restoration effects
    // handle emission. Emitting here would clear URL tags before restoration.

    // Load custom field definitions for filter UI
    this.modelDefinitionsService.getModelDefinitions().subscribe({
      next: (definitions) => {
        const appDef = definitions['Application'];
        if (appDef?.customFields) {
          this.customFieldDefinitions.set(appDef.customFields);
        }
        this.customFieldDefinitionsLoaded = true;
      },
      error: () => {
        this.customFieldDefinitionsLoaded = true;
        this.customFieldDefinitions.set({});
      },
    });
  }

  getCurrentFilters(): EntityListFilters {
    const tagIds = this.activeTagGroupFilters()
      .filter((f) => f.selectedTagId)
      .map((f) => f.selectedTagId);
    const groupIds = [...this.addedTagGroupIds()].filter(Boolean) as string[];
    const customFields: Record<string, string> = {};
    for (const f of this.activeCustomFieldFilters()) {
      if (f.selectedValue) {
        customFields[f.fieldName] = f.selectedValue;
      }
    }
    const customFieldIds = [...this.addedCustomFieldIds()];
    return {
      name: this.appliedNameFilter().trim(),
      technicalSuitability: this.technicalSuitabilityFilter(),
      functionalSuitability: this.functionalSuitabilityFilter(),
      lxTimeClassification: this.timeClassificationFilter(),
      northStarClassification: this.northStarClassificationFilter(),
      businessCriticality: this.businessCriticalityFilter(),
      relApplicationToBusinessCapability:
        this.filterRelApplicationToBusinessCapability(),
      relApplicationToUserGroup: this.filterRelApplicationToUserGroup(),
      relApplicationToProject: this.filterRelApplicationToProject(),
      relApplicationToDataProduct: this.filterRelApplicationToDataProduct(),
      platformTEMP: this.filterPlatformTEMP(),
      tags: tagIds,
      tagGroups: groupIds,
      customFields,
      customFieldIds,
    };
  }

  private emitFilters(): void {
    const f = this.getCurrentFilters();
    this.filtersChange.emit(f);
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

  onBeforeStackingClick(event: MouseEvent): void {
    event.preventDefault();
    this.unstackAllStackedApps.emit();
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

  onNorthStarClassificationChange(change: MatButtonToggleChange): void {
    this.northStarClassificationChanged = true;
    this.northStarClassificationFilter.set(change.value ?? '');
    this.emitFilters();
  }

  onNorthStarClassificationClick(): void {
    if (!this.northStarClassificationChanged) {
      this.northStarClassificationFilter.set('');
      this.emitFilters();
    }
    this.northStarClassificationChanged = false;
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

  onDataProductChange(value: string): void {
    this.filterRelApplicationToDataProduct.set(value ?? '');
    this.dataProductFilterCtrl.setValue('', { emitEvent: false });
    this.emitFilters();
  }
}
