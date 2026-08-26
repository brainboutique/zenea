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

import { Component, input, inject, OnInit, signal, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { Router } from '@angular/router';
import { ServiceCatalogSection, RelationData, DynamicFilterCondition, DynamicFilterValue } from '../../models/service-catalog-item';
import { ReferenceEditorDialogComponent } from '../../components/reference-editor-dialog/reference-editor-dialog.component';
import type { ReferenceEditorItem, ReferenceTargetType } from '../../models/reference-editor-item';
import { EntityApiService } from '../../services/entity-api.service';
import { ApplicationsService } from '../../services/ApplicationsService';
import { CustomFieldsComponent } from '../../components/custom-fields/custom-fields.component';
import { EditFieldComponent } from '../../components/edit-field/edit-field.component';
import { ModelDefinitionsService, CustomFieldDefinition, ModelDefinitionsResponse } from '../../services/model-definitions.service';
import { UserConfigService } from '../../services/user-config.service';
import { FacetsService, FacetRelationItem } from '../../services/FacetsService';
import { buildFacetTreeOptions, FacetTreeOption } from '../../utils/facet-tree-utils';

type AppRelationData = RelationData;

@Component({
  selector: 'app-entity-service-catalog-item',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    NgxMatSelectSearchModule,
    EditFieldComponent,
    CustomFieldsComponent,
  ],
  templateUrl: './entity-service-catalog-item.component.html',
  styleUrl: './entity-service-catalog-item.component.scss',
})
export class EntityServiceCatalogSectionComponent implements OnInit {
  private dialog = inject(MatDialog);
  private entityService = inject(EntityApiService);
  private router = inject(Router);
  private applicationsService = inject(ApplicationsService);
  private modelDefinitionsService = inject(ModelDefinitionsService);
  private userConfig = inject(UserConfigService);
  private facetsService = inject(FacetsService);

  customFields = signal<Record<string, CustomFieldDefinition>>({});

  /** Application custom field definitions (for the attribute dropdown). */
  appCustomFields = signal<Record<string, CustomFieldDefinition>>({});

  /** Business Capability facet options for the BC picker. */
  bcFacetOptions = computed(() => {
    this.facetsService.data();
    const items = this.facetsService.getFacet('relApplicationToBusinessCapability');
    return Array.isArray(items) ? items as FacetRelationItem[] : [];
  });

  /** Search control for BC dropdown. */
  bcSearchCtrl = new FormControl('', { nonNullable: true });
  private bcSearchText = toSignal(this.bcSearchCtrl.valueChanges.pipe(startWith('')), { initialValue: '' });

  /** Hierarchical BC options for the tree dropdown. */
  bcOptionsTree = computed(() => {
    const items = this.bcFacetOptions();
    const searchText = this.bcSearchText() ?? '';
    return buildFacetTreeOptions(items, searchText);
  });

  guid = input.required<string>();
  data = input.required<ServiceCatalogSection | null>();
  onDataMutated = input<() => void>(() => {});
  readOnly = input<boolean>(false);

  private parentItems = signal<Map<string, string>>(new Map());
  private allCatalogItems = signal<any[]>([]);

  childrenList = computed(() => {
    this.dataVersion();
    const currentId = this.guid();
    if (!currentId) return [];
    return this.allCatalogItems().filter(
      (item) => item.id !== currentId && (item.parents ?? []).includes(currentId)
    );
  });

  /** Bump after any mutation so computed signals re-read from data. */
  private dataVersion = signal(0);

  /** Callback for edit-field components to trigger re-render. */
  onFieldMutated = (): void => {
    this.dataVersion.update(v => v + 1);
    this.onDataMutated()?.();
  }

  /** Descriptor for a selectable attribute in the dynamic filter dropdown. */
  private builtinAttributes: Array<{ key: string; label: string; inputType: 'text' | 'select' | 'selectSingle' | 'bcPicker'; options?: string[] }> = [
    { key: 'status', label: 'Status', inputType: 'select', options: ['ACTIVE', 'INACTIVE'] },
    { key: 'displayName', label: 'Display Name', inputType: 'text' },
    { key: 'technicalSuitability', label: 'Technical Suitability', inputType: 'text' },
    { key: 'functionalSuitability', label: 'Functional Suitability', inputType: 'text' },
    { key: 'businessCriticality', label: 'Business Criticality', inputType: 'text' },
    { key: 'lxTimeClassification', label: 'TIME Classification', inputType: 'text' },
    { key: 'northStarClassification', label: 'North Star Classification', inputType: 'text' },
    { key: 'ApplicationLifecycle', label: 'Application Lifecycle', inputType: 'select', options: ['phaseIn', 'active', 'phaseOut', 'endOfLife'] },
    { key: 'relApplicationToBusinessCapability', label: 'Business Capability', inputType: 'bcPicker' },
  ];

  /** All available attributes: built-in + custom fields. */
  availableAttributes = computed(() => {
    const result: Array<{ key: string; label: string; inputType: 'text' | 'select' | 'selectSingle' | 'bcPicker'; options?: string[] }> = [...this.builtinAttributes];
    const cf = this.appCustomFields();
    for (const [key, def] of Object.entries(cf)) {
      const label = def.label?.['en'] ?? key;
      if (def.type === 'selectSingle' && def.values) {
        result.push({ key, label, inputType: 'selectSingle', options: def.values });
      } else if (def.type !== 'textarea' && def.type !== 'link') {
        result.push({ key, label, inputType: 'text' });
      }
    }
    return result;
  });

  /** Current dynamic filter conditions list. */
  dynamicFilterList = computed(() => {
    this.dataVersion();
    const apps = this.data()?.applications as AppRelationData;
    return apps?.dynamic ?? [];
  });

  /** Get the input type for a condition based on its selected attribute key. */
  getConditionInputType(condition: DynamicFilterCondition): string {
    const attrKey = this.getConditionAttributeName(condition);
    if (!attrKey) return 'hidden';
    const attr = this.availableAttributes().find(a => a.key === attrKey);
    return attr?.inputType ?? 'text';
  }

  /** Get the selected attribute name from a condition (first key that is not undefined). */
  getConditionAttributeName(condition: DynamicFilterCondition): string {
    for (const key of Object.keys(condition)) {
      if (condition[key] !== undefined) return key;
    }
    return '';
  }

  /** Get the text/select value for a condition. */
  getConditionTextValue(condition: DynamicFilterCondition): string {
    const key = this.getConditionAttributeName(condition);
    const val = condition[key];
    return typeof val === 'string' ? val : '';
  }

  /** Get the BC entity ID for a relation condition. */
  getConditionRelationId(condition: DynamicFilterCondition, relationKey: string): string {
    const val = condition[relationKey];
    return (typeof val === 'object' && val !== null && 'id' in val) ? val.id : '';
  }

  /** Get the match mode for a relation condition. */
  getConditionMode(condition: DynamicFilterCondition, relationKey: string): string {
    const val = condition[relationKey];
    if (typeof val === 'object' && val !== null && 'mode' in val) return val.mode ?? 'subtree';
    return 'subtree';
  }

  /** Get select options for a condition's attribute. */
  getConditionSelectOptions(condition: DynamicFilterCondition): string[] {
    const key = this.getConditionAttributeName(condition);
    const attr = this.availableAttributes().find(a => a.key === key);
    return attr?.options ?? [];
  }

  /** Add a new empty dynamic filter condition. */
  onAddDynamicCondition(): void {
    const d = this.data();
    if (!d) return;
    if (!d.applications) {
      d.applications = { edges: [], dynamic: [] };
    }
    if (!d.applications.dynamic) {
      d.applications.dynamic = [];
    }
    d.applications.dynamic.push({});
    this.onFieldMutated();
  }

  /** Remove a dynamic filter condition at the given index. */
  onRemoveDynamicCondition(index: number): void {
    const d = this.data();
    if (!d?.applications?.dynamic) return;
    d.applications.dynamic.splice(index, 1);
    this.onFieldMutated();
  }

  /** When the attribute dropdown changes, reset the condition to have only the new key. */
  onDynamicAttributeChange(index: number, newKey: string): void {
    const d = this.data();
    if (!d?.applications?.dynamic) return;
    if (!newKey) {
      d.applications.dynamic[index] = {};
    } else {
      d.applications.dynamic[index] = { [newKey]: '' } as DynamicFilterCondition;
    }
    this.onFieldMutated();
  }

  /** Update the text value of a condition. */
  onDynamicValueChange(index: number, value: string): void {
    const d = this.data();
    if (!d?.applications?.dynamic) return;
    const key = this.getConditionAttributeName(d.applications.dynamic[index]);
    if (key) {
      d.applications.dynamic[index] = { [key]: value } as DynamicFilterCondition;
      this.onFieldMutated();
    }
  }

  /** Update a relation-based condition (BC picker). */
  onDynamicRelationChange(index: number, relationKey: string, entityId: string): void {
    const d = this.data();
    if (!d?.applications?.dynamic) return;
    if (!entityId) {
      const existing = d.applications.dynamic[index];
      delete existing[relationKey];
      this.onFieldMutated();
      return;
    }
    const currentMode = this.getConditionMode(d.applications.dynamic[index], relationKey) as 'subtree' | 'exact';
    d.applications.dynamic[index] = {
      ...d.applications.dynamic[index],
      [relationKey]: { id: entityId, mode: currentMode },
    } as DynamicFilterCondition;
    this.onFieldMutated();
  }

  /** Toggle the subtree/exact mode for a relation condition. */
  onDynamicModeToggle(index: number, relationKey: string): void {
    const d = this.data();
    if (!d?.applications?.dynamic) return;
    const condition = d.applications.dynamic[index];
    const val = condition[relationKey];
    if (typeof val === 'object' && val !== null && 'mode' in val) {
      const newMode = val.mode === 'subtree' ? 'exact' : 'subtree';
      condition[relationKey] = { id: val.id, mode: newMode };
      this.onFieldMutated();
    }
  }

  /** Get the display name for a BC entity ID. */
  getBcDisplayName(id: string): string {
    const item = this.bcFacetOptions().find(o => o.id === id);
    return item?.fullName ?? item?.displayName ?? id;
  }

  ngOnInit(): void {
    const d = this.data();
    if (d && !d.type) {
      d.type = 'ServiceCatalogSection';
    }
    this.applicationsService.ensureLoaded();
    this.loadParentItems();
    this.loadModelDefinitions();
    this.loadAppCustomFields();
    this.loadBcFacetOptions();
  }

  private loadModelDefinitions(): void {
    this.modelDefinitionsService.getModelDefinitions().subscribe({
      next: (definitions: ModelDefinitionsResponse) => {
        const def = definitions['ServiceCatalogSection'];
        if (def?.customFields) {
          this.customFields.set(def.customFields);
        }
      },
      error: () => {
        this.customFields.set({});
      },
    });
  }

  private loadAppCustomFields(): void {
    this.modelDefinitionsService.getModelDefinitions().subscribe({
      next: (definitions: ModelDefinitionsResponse) => {
        const appDef = definitions['Application'];
        if (appDef?.customFields) {
          this.appCustomFields.set(appDef.customFields);
        }
      },
      error: () => {
        this.appCustomFields.set({});
      },
    });
  }

  private loadBcFacetOptions(): void {
    this.facetsService.load();
  }

  private loadParentItems(): void {
    this.entityService.listServiceCatalogSections().subscribe({
      next: (items) => {
        this.allCatalogItems.set(items as any[]);
        const map = new Map<string, string>();
        for (const item of items) {
          map.set(item.id ?? '', item.displayName ?? item.id ?? '');
        }
        this.parentItems.set(map);
      },
    });
  }

  isAbstract = computed(() => {
    this.dataVersion();
    return this.data()?.abstract ?? false;
  });

  setAbstract(value: boolean): void {
    const d = this.data();
    if (!d) return;
    d.abstract = value;
    this.onFieldMutated();
  }

  isHidden = computed(() => {
    this.dataVersion();
    return this.data()?.hidden ?? false;
  });

  setHidden(value: boolean): void {
    const d = this.data();
    if (!d) return;
    d.hidden = value;
    this.onFieldMutated();
  }

  get parentsList(): string[] {
    return this.data()?.parents ?? [];
  }

  getParentLabel(id: string): string {
    return this.parentItems().get(id) ?? id;
  }

  /** Set of existing application IDs from pre-loaded data, or null if not yet loaded. */
  existingAppIds = computed(() => {
    const apps = this.applicationsService.applications();
    return apps.length > 0 ? new Set(apps.map(a => a.id)) : null;
  });

  /** Check if an application ID no longer exists in pre-loaded data. */
  isAppDeleted(id: string): boolean {
    const ids = this.existingAppIds();
    return ids != null && id !== '' && !ids.has(id);
  }

  applicationList = computed(() => {
    this.dataVersion();
    const apps = this.data()?.applications as AppRelationData;
    if (!apps || !apps.edges) return [];
    return apps.edges
      .map((edge) => {
        const fs = edge.node?.factSheet;
        const id = fs ? String(fs['id'] ?? '') : '';
        return {
          id,
          displayName: fs ? String(fs['displayName'] ?? '') : '',
          deleted: this.isAppDeleted(id),
        };
      })
      .filter((item) => !!item.displayName);
  });

  onApplicationClick(id: string): void {
    window.open(this.userConfig.projectUrlString(`entity/Application/${id}`), '_blank');
  }

  onParentsEdit(): void {
    const current: ReferenceEditorItem[] = this.parentsList.map((id) => {
      const displayName = this.parentItems().get(id) ?? id;
      return {
        id,
        type: 'ServiceCatalogSection' as ReferenceTargetType,
        displayName,
        fullName: undefined,
        description: undefined,
      };
    });

const ref = this.dialog.open(ReferenceEditorDialogComponent, {
      width: '80vw',
      maxWidth: '80vw',
      height: '80vh',
      maxHeight: '80vh',
      panelClass: 'reference-editor-dialog-panel',
      data: { targetType: 'ServiceCatalogSection', currentSelection: current },
    });

    ref.afterClosed().subscribe((result: ReferenceEditorItem[] | undefined) => {
      if (result == null) return;
      const d = this.data();
      if (!d) return;
      d.parents = result.map((r) => r.id);
      this.onDataMutated()();
    });
  }

  onParentClick(id: string): void {
    const displayName = this.parentItems().get(id) ?? 'Loading...';
    this.router.navigate(this.userConfig.projectUrl(['list', 'ServiceCatalog', `${id}-${displayName}`]));
  }

  onChildClick(id: string): void {
    this.router.navigate(this.userConfig.projectUrl(['entity', 'ServiceCatalogSection', id]));
  }

  onCreateChild(): void {
    const guid = crypto.randomUUID();
    const currentId = this.guid();
    this.router.navigate(this.userConfig.projectUrl(['entity', 'ServiceCatalogSection', guid]), {
      queryParams: { parent: currentId },
      state: { returnTo: this.userConfig.projectUrlString(`entity/ServiceCatalogSection/${currentId}`) },
    });
  }

  onApplicationsEdit(): void {
    const apps = this.data()?.applications as AppRelationData;
    const current: ReferenceEditorItem[] = apps?.edges?.map((edge) => {
      const fs = edge.node?.factSheet ?? {};
      return {
        id: String(fs['id'] ?? ''),
        type: 'Application' as ReferenceTargetType,
        displayName: String(fs['displayName'] ?? ''),
        fullName: undefined,
        description: typeof fs['description'] === 'string' ? fs['description'] : undefined,
      };
    }) ?? [];

    const bc = this.businessCapabilityList;
    const ref = this.dialog.open(ReferenceEditorDialogComponent, {
      width: '80vw',
      maxWidth: '80vw',
      height: '80vh',
      maxHeight: '80vh',
      panelClass: 'reference-editor-dialog-panel',
      data: { targetType: 'Application', currentSelection: current, capabilitiesToMatch: bc },
    });

    ref.afterClosed().subscribe((result: ReferenceEditorItem[] | undefined) => {
      if (result == null) return;
      const d = this.data();
      if (!d) return;
      d.applications = {
        edges: result.map((r) => ({
          node: { factSheet: { id: r.id, type: 'Application', displayName: r.displayName } },
        })),
      };
      this.onFieldMutated();
    });
  }

  serviceList = computed(() => {
    this.dataVersion();
    const services = this.data()?.services as AppRelationData;
    if (!services || !services.edges) return [];
    return services.edges
      .map((edge) => {
        const fs = edge.node?.factSheet;
        const id = fs ? String(fs['id'] ?? '') : '';
        return {
          id,
          displayName: fs ? String(fs['displayName'] ?? '') : '',
        };
      })
      .filter((item) => !!item.displayName);
  });

  onServiceClick(id: string): void {
    window.open(this.userConfig.projectUrlString(`entity/ServiceCatalogService/${id}`), '_blank');
  }

  onServicesEdit(): void {
    const services = this.data()?.services as AppRelationData;
    const current: ReferenceEditorItem[] = services?.edges?.map((edge) => {
      const fs = edge.node?.factSheet ?? {};
      return {
        id: String(fs['id'] ?? ''),
        type: 'ServiceCatalogService' as ReferenceTargetType,
        displayName: String(fs['displayName'] ?? ''),
        fullName: undefined,
        description: typeof fs['description'] === 'string' ? fs['description'] : undefined,
      };
    }) ?? [];

    const ref = this.dialog.open(ReferenceEditorDialogComponent, {
      width: '80vw',
      maxWidth: '80vw',
      height: '80vh',
      maxHeight: '80vh',
      panelClass: 'reference-editor-dialog-panel',
      data: { targetType: 'ServiceCatalogService', currentSelection: current },
    });

    ref.afterClosed().subscribe((result: ReferenceEditorItem[] | undefined) => {
      if (result == null) return;
      const d = this.data();
      if (!d) return;
      d.services = {
        edges: result.map((r) => ({
          node: { factSheet: { id: r.id, type: 'ServiceCatalogService', displayName: r.displayName } },
        })),
      };
      this.onFieldMutated();
    });
  }

  get businessCapabilityList(): string[] {
    const bc = this.data()?.relServiceCatalogSectionToBusinessCapability as AppRelationData;
    if (!bc || !bc.edges) return [];
    return bc.edges
      .map((edge) => {
        const fs = edge.node?.factSheet;
        return fs ? String(fs['displayName'] ?? '') : '';
      })
      .filter((name) => !!name);
  }

  get userGroupList(): { id: string; displayName: string }[] {
    const ug = this.data()?.userGroups as AppRelationData;
    if (!ug || !ug.edges) return [];
    return ug.edges
      .map((edge) => {
        const fs = edge.node?.factSheet;
        return {
          id: fs ? String(fs['id'] ?? '') : '',
          displayName: fs ? String(fs['displayName'] ?? '') : '',
        };
      })
      .filter((item) => !!item.displayName);
  }

  onUserGroupClick(id: string): void {
    window.open(this.userConfig.projectUrlString(`entity/UserGroup/${id}`), '_blank');
  }

  onUserGroupsEdit(): void {
    const ug = this.data()?.userGroups as AppRelationData;
    const current: ReferenceEditorItem[] = ug?.edges?.map((edge) => {
      const fs = edge.node?.factSheet ?? {};
      return {
        id: String(fs['id'] ?? ''),
        type: 'UserGroup' as ReferenceTargetType,
        displayName: String(fs['displayName'] ?? ''),
        fullName: undefined,
        description: typeof fs['description'] === 'string' ? fs['description'] : undefined,
      };
    }) ?? [];

    const ref = this.dialog.open(ReferenceEditorDialogComponent, {
      width: '80vw',
      maxWidth: '80vw',
      height: '80vh',
      maxHeight: '80vh',
      panelClass: 'reference-editor-dialog-panel',
      data: { targetType: 'UserGroup', currentSelection: current },
    });

    ref.afterClosed().subscribe((result: ReferenceEditorItem[] | undefined) => {
      if (result == null) return;
      const d = this.data();
      if (!d) return;
      d.userGroups = {
        edges: result.map((r) => ({
          node: { factSheet: { id: r.id, type: 'UserGroup', displayName: r.displayName } },
        })),
      };
      this.onDataMutated()();
    });
  }

  onBusinessCapabilityEdit(): void {
    const bc = this.data()?.relServiceCatalogSectionToBusinessCapability as AppRelationData;
    const current: ReferenceEditorItem[] = bc?.edges?.map((edge) => {
      const fs = edge.node?.factSheet ?? {};
      return {
        id: String(fs['id'] ?? ''),
        type: 'BusinessCapability' as ReferenceTargetType,
        displayName: String(fs['displayName'] ?? ''),
        fullName: undefined,
        description: typeof fs['description'] === 'string' ? fs['description'] : undefined,
      };
    }) ?? [];

    const ref = this.dialog.open(ReferenceEditorDialogComponent, {
      width: '80vw',
      maxWidth: '80vw',
      height: '80vh',
      maxHeight: '80vh',
      panelClass: 'reference-editor-dialog-panel',
      data: { targetType: 'BusinessCapability', currentSelection: current },
    });

    ref.afterClosed().subscribe((result: ReferenceEditorItem[] | undefined) => {
      if (result == null) return;
      const d = this.data();
      if (!d) return;
      d.relServiceCatalogSectionToBusinessCapability = {
        edges: result.map((r) => ({
          node: { factSheet: { id: r.id, type: 'BusinessCapability', displayName: r.displayName } },
        })),
      };
      this.onDataMutated()();
    });
  }
}
