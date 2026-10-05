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

import { Component, input, computed, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { PillsComponent } from '../../components/pills/pills.component';
import { PillItem } from '../../components/pills/pill-item';
import { SuitabilityRatingComponent } from '../../components/suitability-rating/suitability-rating.component';
import { TimeClassificationComponent } from '../../components/time-classification/time-classification.component';
import { UserGroupPillComponent } from '../../components/user-group-pill/user-group-pill.component';
import { MigrationTargetPillComponent } from '../../components/migration-target-pill/migration-target-pill.component';
import { AlternativesPillComponent } from '../../components/alternatives-pill/alternatives-pill.component';
import { EditFieldComponent } from '../../components/edit-field/edit-field.component';
import { EditFieldRatingComponent } from '../../components/edit-field-rating/edit-field-rating.component';
import { EditFieldTimeComponent } from '../../components/edit-field-time/edit-field-time.component';
import { EditFieldNorthStarComponent } from '../../components/edit-field-north-star/edit-field-north-star.component';
import { EditFieldTagsComponent } from '../../components/edit-field-tags/edit-field-tags.component';
import { ApplicationsService } from '../../services/ApplicationsService';
import { FacetsService } from '../../services/FacetsService';
import { AttributePermissionsService } from '../../services/attribute-permissions.service';
import { EntityApiService } from '../../services/entity-api.service';
import { BcTreeService } from '../../services/bc-tree.service';
import { MigrationTargetDialogComponent } from '../../components/migration-target-dialog/migration-target-dialog.component';
import { MigrationTargetItem } from '../../models/migration-target-item';
import { AlternativesDialogComponent } from '../../components/alternatives-dialog/alternatives-dialog.component';
import { AlternativeItem } from '../../models/alternative-item';
import { ReferenceEditorDialogComponent } from '../../components/reference-editor-dialog/reference-editor-dialog.component';
import type { ReferenceEditorDialogData, ReferenceEditorItem, ReferenceTargetType } from '../../models/reference-editor-item';
import { SubscriptionDialogComponent, SubscriptionDialogData } from '../../components/subscription-dialog/subscription-dialog.component';
import type { SubscriptionItem } from '../../models/subscription-item';
import { subscriptionTypeColor } from '../../models/subscription-item';
import { TranslatePipe } from '@ngx-translate/core';
import { CustomFieldsComponent } from '../../components/custom-fields/custom-fields.component';
import { ModelDefinitionsService, CustomFieldDefinition, ModelDefinitionsResponse } from '../../services/model-definitions.service';
import { VirtualAttributeService } from '../../services/virtual-attribute.service';
import { RegionMapWidgetComponent } from '../../components/region-map-widget/region-map-widget.component';
import { UserGroupsDataService } from '../../services/UserGroupsDataService';
import { extractParentIds } from '../../utils/parent-utils';
import { RelationData } from '../../utils/relation-data';

export type { RelationData };

/** Status dropdown options for application entity. */
export const APPLICATION_STATUS_OPTIONS = ['ACTIVE', 'INACTIVE'] as const;

/** Application lifecycle dropdown options. */
export const APPLICATION_LIFECYCLE_OPTIONS = ['phaseIn', 'active', 'phaseOut', 'endOfLife'] as const;

/** Cost unit dropdown options. */
export const COST_UNIT_OPTIONS = ['User', 'm³', 't', 'kg', 'units', 'flat'] as const;

/** Application entity shape (subset we render). */
export interface ApplicationData {
  type?: string;
  displayName?: string;
  description?: string | null;
  earmarkingsTEMP?: string;
  tags?: Array<{ name?: string; label?: string; description?: string; color?: string }>;
  status?: string;
  qualitySeal?: string | boolean;
  ApplicationLifecycle?: { asString?: string };
  lxTimeClassification?: string | null;
  lxTimeClassificationDescription?: string;
  northStarClassification?: string | null;
  northStarClassificationDescription?: string;
  /** Migration targets: edges notation or flat array. Legacy string/single object normalized on read. */
  migrationTarget?: RelationData | Array<{ id: string; displayName: string; lifecycle?: string; proportion?: number; priority?: number; effort?: string; benefit?: string; eta?: string; comments?: string; userGroup?: Array<{ id: string; displayName: string; fullName?: string }> | null }> | null;
  /** Alternative applications: edges notation or flat array. */
  alternatives?: RelationData | Array<{ id: string; displayName: string; functionalOverlap?: number; comment?: string }> | null;
  businessCriticality?: string;
  functionalSuitability?: string;
  functionalSuitabilityDescription?: string;
  technicalSuitability?: string;
  technicalSuitabilityDescription?: string;
  /** Cost value (numeric). */
  cost?: number | null;
  /** Cost unit: User, m³, t, kg, units, flat */
  costUnit?: string | null;
  /** Relation: object with edges[] and each edge.node.factSheet (displayName, fullName, description). */
  relApplicationToPlatform?: RelationData;
  relApplicationToBusinessCapability?: RelationData;
  relApplicationToUserGroup?: RelationData;
  relApplicationToDataProduct?: RelationData;
  relToChild?: RelationData;
  relToParent?: RelationData;
  [key: string]: unknown;
}

/** Normalize alternatives to edges on read (handles legacy string, single object, flat array, or edges notation). */
function normalizeAlternativesToEdges(alt: unknown): RelationData | undefined {
  if (alt == null) return undefined;
  if (typeof alt === 'string') {
    return { edges: [{ node: { factSheet: { id: alt, type: 'Application', displayName: alt } } }] };
  }
  if (Array.isArray(alt)) {
    const edges: Array<{ node: { factSheet: { id: string; type: string; displayName: string } }; functionalOverlap?: number; comment?: string }> = [];
    for (const item of alt) {
      if (typeof item !== 'object' || item === null) continue;
      const id = item?.id ?? '';
      if (!id) continue;
      const edge: { node: { factSheet: { id: string; type: string; displayName: string } }; functionalOverlap?: number; comment?: string } = {
        node: { factSheet: { id: String(id), type: item?.type ?? 'Application', displayName: item?.displayName ?? String(id) } },
      };
      if (item?.functionalOverlap != null) edge.functionalOverlap = item.functionalOverlap;
      if (item?.comment != null) edge.comment = item.comment;
      edges.push(edge);
    }
    return edges.length > 0 ? { edges } : undefined;
  }
  if (typeof alt === 'object' && alt !== null) {
    const o = alt as Record<string, unknown>;
    if (Array.isArray(o['edges'])) return alt as RelationData;
    const id = o['id'];
    const displayName = o['displayName'] ?? id ?? '';
    const type = (o['type'] as string) ?? 'Application';
    if (id == null || id === '') return undefined;
    return {
      edges: [{ node: { factSheet: { id: String(id), type, displayName: String(displayName) } } }],
    };
  }
  return undefined;
}

/** Normalize migrationTarget to edges on read (handles legacy string, single object, flat array, or edges notation). */
function normalizeMigrationTargetToEdges(mt: unknown): RelationData | undefined {
  if (mt == null) return undefined;
  if (typeof mt === 'string') {
    return { edges: [{ node: { factSheet: { id: mt, type: 'Application', displayName: mt } } }] };
  }
  if (Array.isArray(mt)) {
    const edges: Array<{ node: { factSheet: { id: string; type: string; displayName: string } }; lifecycle?: string; proportion?: number; priority?: number; effort?: string; benefit?: string; eta?: string; comments?: string; startDate?: string; endDate?: string; projectReference?: string; userGroup?: { edges: Array<{ node: { factSheet: { id: string; type: string; displayName: string } } }> } | null }> = [];
    for (const item of mt) {
      if (typeof item !== 'object' || item === null) continue;
      const id = item?.id ?? '';
      if (!id) continue;
      const edge: { node: { factSheet: { id: string; type: string; displayName: string } }; lifecycle?: string; proportion?: number; priority?: number; effort?: string; benefit?: string; eta?: string; comments?: string; startDate?: string; endDate?: string; projectReference?: string; userGroup?: { edges: Array<{ node: { factSheet: { id: string; type: string; displayName: string } } }> } | null } = {
        node: { factSheet: { id: String(id), type: item?.type ?? 'Application', displayName: item?.displayName ?? String(id) } },
      };
      if (item?.lifecycle != null) edge.lifecycle = item.lifecycle;
      if (item?.proportion != null) edge.proportion = item.proportion;
      if (item?.priority != null) edge.priority = item.priority;
      if (item?.effort != null) edge.effort = item.effort;
      if (item?.benefit != null) edge.benefit = item.benefit;
      if (item?.eta != null) edge.eta = item.eta;
      if (item?.comments != null) edge.comments = item.comments;
      if (item?.startDate != null) edge.startDate = item.startDate;
      if (item?.endDate != null) edge.endDate = item.endDate;
      if (item?.projectReference != null) edge.projectReference = item.projectReference;
      if (Array.isArray(item?.userGroup) && item.userGroup.length > 0) {
        edge.userGroup = {
          edges: item.userGroup.map((ug: any) => ({
            node: { factSheet: { id: String(ug.id), type: 'UserGroup', displayName: ug.displayName ?? String(ug.id) } },
          })),
        };
      } else if (item?.userGroup != null && typeof item.userGroup === 'object' && 'edges' in item.userGroup) {
        edge.userGroup = item.userGroup;
      }
      edges.push(edge);
    }
    return edges.length > 0 ? { edges } : undefined;
  }
  if (typeof mt === 'object' && mt !== null) {
    const o = mt as Record<string, unknown>;
    if (Array.isArray(o['edges'])) return mt as RelationData;
    const id = o['id'];
    const displayName = o['displayName'] ?? id ?? '';
    const type = (o['type'] as string) ?? 'Application';
    if (id == null || id === '') return undefined;
    return {
      edges: [{ node: { factSheet: { id: String(id), type, displayName: String(displayName) } } }],
    };
  }
  return undefined;
}

/** Extract pill items from relation object: edges[].node.factSheet (Business Capabilities, Platform, etc.). */
function relationToPillItems(rel: RelationData | unknown, existingIds?: Set<string> | null, archivedIds?: Set<string> | null): PillItem[] {
  if (!rel || typeof rel !== 'object' || !Array.isArray((rel as RelationData).edges)) return [];
  const edges = (rel as RelationData).edges!;
  return edges.map((edge) => {
    const factSheet = edge?.node?.factSheet;
    if (!factSheet || typeof factSheet !== 'object') return { label: '—' };
    const fs = factSheet as Record<string, unknown>;
    const id = String(fs['id'] ?? '');
    const label = String(fs['displayName'] ?? fs['fullName'] ?? fs['name'] ?? id ?? '—');
    const description = typeof fs['description'] === 'string' ? fs['description'] : '';
    const color = typeof fs['color'] === 'string' ? fs['color'] : undefined;
    const deleted = existingIds != null && id !== '' && !existingIds.has(id);
    const inactive = archivedIds?.has(id) ?? false;
    const coverage = typeof edge?.coverage === 'number' ? edge.coverage : undefined;
    const comments = typeof edge?.comments === 'string' ? edge.comments : '';
    const hasMeta = coverage != null || comments.trim() !== '';
    let title: string | undefined;
    if (hasMeta) {
      const parts = [coverage != null ? `${label} (${coverage}%)` : label];
      if (comments.trim()) parts.push(comments.trim());
      title = parts.join('\n');
    } else if (description) {
      title = `${label}\n${description}`;
    } else {
      title = label;
    }
    return { label, title, color, deleted, inactive, coverage, notes: hasMeta };
  });
}

@Component({
  selector: 'app-entity-application',
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
    PillsComponent,
    UserGroupPillComponent,
    MigrationTargetPillComponent,
    AlternativesPillComponent,
    EditFieldComponent,
    EditFieldRatingComponent,
    EditFieldTimeComponent,
    EditFieldNorthStarComponent,
    EditFieldTagsComponent,
    TranslatePipe,
    CustomFieldsComponent,
    RegionMapWidgetComponent,
  ],
  templateUrl: './entity-application.component.html',
  styleUrl: './entity-application.component.scss',
})
export class EntityApplicationComponent {
  readonly applicationStatusOptions: string[] = [...APPLICATION_STATUS_OPTIONS];
  readonly applicationLifecycleOptions: string[] = [...APPLICATION_LIFECYCLE_OPTIONS];
  private applicationsService = inject(ApplicationsService);
  private facetsService = inject(FacetsService);
  private modelDefinitionsService = inject(ModelDefinitionsService);
  private virtualAttributeService = inject(VirtualAttributeService);
  private userGroupsDataService = inject(UserGroupsDataService);
  private entityApi = inject(EntityApiService);
  private bcTree = inject(BcTreeService);

  private dialog = inject(MatDialog);
  private attrPerms = inject(AttributePermissionsService);

  customFields = signal<Record<string, CustomFieldDefinition>>({});

  isReadable(field: string): boolean {
    return this.attrPerms.isReadable(field);
  }

  isFieldReadOnly(field: string): boolean {
    return this.readOnly() || !this.attrPerms.isWritable(field);
  }

  constructor() {
    this.modelDefinitionsService.getModelDefinitions().subscribe({
      next: (definitions: ModelDefinitionsResponse) => {
        const appDef = definitions['Application'];
        if (appDef?.customFields) {
          this.customFields.set(appDef.customFields);
        }
      },
      error: () => {
        this.customFields.set({});
      },
    });

    // Load full BC list for focus improvement logic
    this.bcTree.load();

    effect(() => {
      const d = this.data();
      const cf = this.customFields();
      if (!d || !cf) return;
      this.recomputeVirtualAttributes(d as Record<string, unknown>, cf);
    });
  }

  /** Recompute all virtual attributes on the entity data object. */
  private recomputeVirtualAttributes(entity: Record<string, unknown>, fields: Record<string, CustomFieldDefinition>): void {
    const virtualDefs: Record<string, CustomFieldDefinition> = {};
    for (const [key, def] of Object.entries(fields)) {
      if (def.type === 'virtual' && def.formula) {
        virtualDefs[key] = def;
      }
    }
    if (Object.keys(virtualDefs).length === 0) return;
    this.virtualAttributeService.computeVirtualAttributes(entity, virtualDefs);
  }

  guid = input.required<string>();
  data = input.required<ApplicationData | null>();
  /** Called when a child mutates data (e.g. suitability rating). Use to sync derived state (e.g. raw JSON). */
  onDataMutated = input<() => void>(() => {});
  /** If true, disable all edit controls. Default: false. */
  readOnly = input<boolean>(false);

  /** Migration target edges from data (normalized on read: string/single object → edges). */
  private migrationTargetEdges = computed(() => {
    const d = this.data();
    const raw = d?.migrationTarget;
    return normalizeMigrationTargetToEdges(raw) ?? undefined;
  });

  private alternativesEdges = computed(() => {
    const d = this.data();
    const raw = d?.alternatives;
    return normalizeAlternativesToEdges(raw) ?? undefined;
  });

  /** Current selection as MigrationTargetItem[] for the dialog. */
  migrationTargetSelectionForDialog = computed((): MigrationTargetItem[] => {
    const rel = this.migrationTargetEdges();
    if (!rel?.edges?.length) return [];
    return rel.edges.map((edge) => {
      const fs = edge?.node?.factSheet as Record<string, unknown> | undefined;
      const rec = edge as Record<string, unknown>;
      const id = fs?.['id'];
      const displayName = fs?.['displayName'];
      const proportion = rec['proportion'];
      const comments = rec['comments'];
      const ugRaw = rec['userGroup'] as Record<string, unknown> | undefined;
      let userGroup: Array<{ id: string; displayName: string; fullName?: string }> | null = null;
      if (ugRaw && Array.isArray(ugRaw['edges'])) {
        userGroup = ugRaw['edges'].map((e: any) => {
          const ufs = e?.node?.factSheet ?? {};
          return {
            id: String(ufs?.id ?? ''),
            displayName: String(ufs?.displayName ?? ufs?.fullName ?? ufs?.id ?? ''),
            fullName: ufs?.fullName != null ? String(ufs.fullName) : undefined,
          };
        }).filter((u: any) => u.id !== '');
        if (userGroup.length === 0) userGroup = null;
      }
      return {
        id: id != null && id !== '' ? String(id) : '',
        type: (fs?.['type'] as string) ?? 'Application',
        displayName: displayName != null ? String(displayName) : String(id ?? ''),
        lifecycle: rec['lifecycle'] != null && rec['lifecycle'] !== '' ? String(rec['lifecycle']) : undefined,
        proportion: typeof proportion === 'number' && !Number.isNaN(proportion) ? proportion : 100,
        priority: rec['priority'] != null && rec['priority'] !== '' ? (rec['priority'] as number) : undefined,
        effort: rec['effort'] != null && rec['effort'] !== '' ? String(rec['effort']) : undefined,
        benefit: rec['benefit'] != null && rec['benefit'] !== '' ? String(rec['benefit']) : undefined,
        eta: rec['eta'] != null && rec['eta'] !== '' ? String(rec['eta']) : undefined,
        comments: comments != null && comments !== '' ? String(comments) : undefined,
        startDate: rec['startDate'] != null && rec['startDate'] !== '' ? String(rec['startDate']) : undefined,
        endDate: rec['endDate'] != null && rec['endDate'] !== '' ? String(rec['endDate']) : undefined,
        projectReference: rec['projectReference'] != null && rec['projectReference'] !== '' ? String(rec['projectReference']) : undefined,
        userGroup,
      };
    }).filter((m) => m.id !== '');
  });

  alternativesSelectionForDialog = computed((): AlternativeItem[] => {
    const rel = this.alternativesEdges();
    if (!rel?.edges?.length) return [];
    return rel.edges
      .map((edge) => {
        const fs = edge?.node?.factSheet as Record<string, unknown> | undefined;
        const rec = edge as Record<string, unknown>;
        const id = fs?.['id'];
        const displayName = fs?.['displayName'];
        const functionalOverlap = rec['functionalOverlap'];
        const comment = rec['comment'];
        return {
          id: id != null && id !== '' ? String(id) : '',
          type: (fs?.['type'] as string) ?? 'Application',
          displayName: displayName != null ? String(displayName) : String(id ?? ''),
          functionalOverlap:
            typeof functionalOverlap === 'number' && !Number.isNaN(functionalOverlap) ? functionalOverlap : 100,
          comment: comment != null && String(comment).trim() !== '' ? String(comment) : '',
        };
      })
      .filter((m) => m.id !== '');
  });

  /** Label for migration target button: "N applications" or "Select migration target". */
  migrationTargetButtonLabel = computed(() => {
    const arr = this.migrationTargetSelectionForDialog();
    if (arr.length === 0) return 'Select…';
    return arr
      .map((m) => {
        const parts: string[] = [];
        if (m.lifecycle) parts.push(String(m.lifecycle));
        if (m.proportion != null && m.proportion !== 100) parts.push(`${m.proportion}%`);
        if (m.priority != null) parts.push(`P${m.priority}`);
        if (m.effort) parts.push(String(m.effort));
        if (m.benefit) parts.push(String(m.benefit));
        if (m.eta) parts.push(String(m.eta));
        const bracket = parts.length ? ` [${parts.join(', ')}]` : '';
        return `${m.displayName}${bracket}`;
      })
      .filter(Boolean)
      .join(', ');
  });

  /** Set of existing application IDs from pre-loaded data, or null if not yet loaded. */
  existingAppIds = computed(() => {
    const apps = this.applicationsService.applications();
    return apps.length > 0 ? new Set(apps.map(a => a.id)) : null;
  });

  /** Bump after any mutation so computed signals re-read from data. */
  private dataVersion = signal(0);

  /** Bump after mutating ApplicationLifecycle.asString so applicationLifecycleAsString re-runs. */
  private applicationLifecycleVersion = signal(0);
  /** Bump after mutating reference relations (link dialog) so pill computeds re-run. */
  private referenceRelationsVersion = signal(0);

  tagsPills = computed(() => {
    this.dataVersion();
    const d = this.data();
    const raw = d?.tags;
    if (!Array.isArray(raw)) return [];
    return raw.map((t: Record<string, unknown>) => ({
      label: String(t['name'] ?? t['label'] ?? t['description'] ?? '—'),
      color: typeof t['color'] === 'string' ? t['color'] : undefined,
      title: typeof t['description'] === 'string' ? t['description'] : undefined,
    }));
  });

  relApplicationToPlatformPills = computed(() => {
    this.referenceRelationsVersion();
    this.dataVersion();
    return relationToPillItems(this.data()?.relApplicationToPlatform);
  });
  relApplicationToBusinessCapabilityPills = computed(() => {
    this.referenceRelationsVersion();
    this.dataVersion();
    return relationToPillItems(this.data()?.relApplicationToBusinessCapability, null, this.bcTree.activelyReachableIds());
  });

  /** Whether any assigned BC has at least one single-parented child (for focus button visibility). */
  hasSingleParentedChildrenForFocus = computed(() => {
    this.referenceRelationsVersion();
    this.dataVersion();
    const rel = this.data()?.relApplicationToBusinessCapability;
    if (!rel || typeof rel !== 'object' || !Array.isArray(rel.edges)) return false;
    const assignedIds = new Set(
      rel.edges.map((e) => e?.node?.factSheet?.['id']).filter((id): id is string => id != null && id !== ''),
    );
    if (!assignedIds.size) return false;
    const allBcs = this.bcTree.rawItems();
    if (!allBcs.length) return false;
    return allBcs.some((bc) => { const pids = extractParentIds(bc.relToParent); return pids.length === 1 && assignedIds.has(pids[0]); });
  });
  relApplicationToDataProductPills = computed(() => {
    this.referenceRelationsVersion();
    this.dataVersion();
    return relationToPillItems(this.data()?.relApplicationToDataProduct);
  });
  /** User group items from relApplicationToUserGroup edges: fullName (label), displayName (title + border/icon). */
  relApplicationToUserGroupItems = computed(() => {
    this.referenceRelationsVersion();
    this.dataVersion();
    const rel = this.data()?.relApplicationToUserGroup;
    if (!rel || typeof rel !== 'object' || !Array.isArray(rel.edges)) return [];
    return rel.edges.map((edge) => {
      const fs = edge?.node?.factSheet;
      if (!fs || typeof fs !== 'object') return { fullName: '—', displayName: '—' };
      const r = fs as Record<string, unknown>;
      const displayName = String(r['displayName'] ?? r['fullName'] ?? r['name'] ?? r['id'] ?? '—');
      const fullName = String(r['fullName'] ?? r['displayName'] ?? r['name'] ?? r['id'] ?? '—');
      return { fullName, displayName };
    });
  });

  /** User group IDs from relApplicationToUserGroup edges for the map widget. */
  relApplicationToUserGroupIds = computed(() => {
    this.referenceRelationsVersion();
    this.dataVersion();
    const rel = this.data()?.relApplicationToUserGroup;
    if (!rel || typeof rel !== 'object' || !Array.isArray(rel.edges)) return [];
    return rel.edges
      .map((edge) => edge?.node?.factSheet?.['id'])
      .filter((id): id is string => id != null && id !== '');
  });
  relToChildPills = computed(() => {
    this.dataVersion();
    return relationToPillItems(this.data()?.relToChild, this.existingAppIds());
  });
  relToParentPills = computed(() => {
    this.dataVersion();
    return relationToPillItems(this.data()?.relToParent, this.existingAppIds());
  });

  /** Check if an application ID no longer exists in pre-loaded data. */
  isAppDeleted(id: string): boolean {
    const ids = this.existingAppIds();
    return ids != null && id !== '' && !ids.has(id);
  }

  /** Callback for edit-field components to trigger re-render. */
  onFieldMutated = (): void => {
    this.dataVersion.update(v => v + 1);
    this.onDataMutated()?.();
  }

  qualitySeal = computed(() => {
    const v = this.data()?.qualitySeal;
    if (v === true || v === false) return v ? 'Yes' : 'No';
    return v != null ? String(v) : '';
  });

  applicationLifecycleAsString = computed(() => {
    this.applicationLifecycleVersion();
    return this.data()?.ApplicationLifecycle?.asString ?? '';
  });

  lxTimeClassificationDescription = computed(() => {
    this.dataVersion();
    return this.data()?.lxTimeClassificationDescription ?? '';
  });

  northStarClassificationDescription = computed(() => {
    this.dataVersion();
    return this.data()?.northStarClassificationDescription ?? '';
  });

  onApplicationLifecycleChange(value: string): void {
    const d = this.data();
    if (!d) return;
    if (!d.ApplicationLifecycle || typeof d.ApplicationLifecycle !== 'object') {
      d.ApplicationLifecycle = { asString: value };
    } else {
      (d.ApplicationLifecycle as Record<string, unknown>)['asString'] = value;
    }
    this.applicationLifecycleVersion.update((v) => v + 1);
    this.onDataMutated()?.();
  }

  readonly costUnitOptions: string[] = [...COST_UNIT_OPTIONS];

  /** Whether this app is in TIME classification "migrate" (controls Migration Target styling). */
  isMigrationMigrate = computed(() => (this.data()?.lxTimeClassification ?? '').toString().toLowerCase() === 'migrate');

  readonly subscriptionTypeColor = subscriptionTypeColor;

  /** Subscriptions edges normalized from data. */
  private subscriptionsEdges = computed(() => {
    this.dataVersion();
    const d = this.data();
    const raw = (d as Record<string, unknown> | undefined)?.['subscriptions'];
    if (raw == null || typeof raw !== 'object') return undefined;
    const rec = raw as Record<string, unknown>;
    if (!Array.isArray(rec['edges'])) return undefined;
    return rec as { edges: Array<Record<string, unknown>> };
  });

  /** Subscriptions as PillItem[] for display. */
  subscriptionsPills = computed((): PillItem[] => {
    this.dataVersion();
    const rel = this.subscriptionsEdges();
    if (!rel?.edges?.length) return [];
    return rel.edges
      .map((edge) => {
        const node = edge?.['node'] as Record<string, unknown> | undefined;
        if (!node) return null;
        const user = node['user'] as Record<string, unknown> | undefined;
        const type = typeof node['type'] === 'string' ? node['type'] : '';
        const displayName = typeof user?.['displayName'] === 'string' ? user['displayName'] : '';
        if (!displayName) return null;
        return {
          label: displayName,
          color: subscriptionTypeColor(type),
          title: type ? `${type}: ${displayName}` : displayName,
        } as PillItem;
      })
      .filter((p): p is PillItem => p != null);
  });

  /** Subscriptions as SubscriptionItem[] for the dialog. */
  subscriptionsSelectionForDialog = computed((): SubscriptionItem[] => {
    const rel = this.subscriptionsEdges();
    if (!rel?.edges?.length) return [];
    return rel.edges
      .map((edge) => {
        const node = edge?.['node'] as Record<string, unknown> | undefined;
        if (!node) return null;
        const user = node['user'] as Record<string, unknown> | undefined;
        const type = typeof node['type'] === 'string' ? node['type'] : '';
        const id = typeof node['id'] === 'string' ? node['id'] : '';
        const displayName = typeof user?.['displayName'] === 'string' ? user['displayName'] : '';
        const email = typeof user?.['email'] === 'string' ? user['email'] : undefined;
        const userId = typeof user?.['id'] === 'string' ? user['id'] : undefined;
        if (!id || !displayName) return null;
        return { id, type, displayName, email, userId } as SubscriptionItem;
      })
      .filter((s): s is SubscriptionItem => s != null);
  });

  /** Open subscriptions dialog. On close, update data and trigger save. */
  openSubscriptionsDialog(): void {
    const current = this.subscriptionsSelectionForDialog();
    const ref = this.dialog.open(SubscriptionDialogComponent, {
      width: '70vw',
      maxWidth: '70vw',
      height: '60vh',
      maxHeight: '60vh',
      panelClass: 'migration-target-dialog-panel',
      data: { currentSelection: current.map((s) => ({ ...s })) } satisfies SubscriptionDialogData,
    });
    ref.afterClosed().subscribe((result: SubscriptionItem[] | undefined) => {
      if (result == null) return;
      const d = this.data();
      if (!d) return;
      if (result.length === 0) {
        (d as Record<string, unknown>)['subscriptions'] = { edges: [], totalCount: 0 };
      } else {
        (d as Record<string, unknown>)['subscriptions'] = {
          edges: result.map((s) => ({
            node: {
              id: s.id,
              type: s.type,
              user: {
                id: s.userId ?? '',
                displayName: s.displayName,
                email: s.email ?? '',
              },
            },
          })),
        };
      }
      this.dataVersion.update((v) => v + 1);
      this.onDataMutated()?.();
    });
  }

  private alternativesToRelationData(items: AlternativeItem[]): RelationData {
    if (items.length === 0) return { edges: [] };
    return {
      edges: items.map((m) => {
        const edge: Record<string, unknown> = {
          node: { factSheet: { id: m.id, type: m.type ?? 'Application', displayName: m.displayName } },
        };
        const rawFo = m.functionalOverlap;
        const fo =
          rawFo != null && !Number.isNaN(Number(rawFo)) ? Math.min(100, Math.max(0, Math.round(Number(rawFo)))) : 100;
        edge['functionalOverlap'] = fo;
        if (m.comment != null && String(m.comment).trim() !== '') edge['comment'] = String(m.comment).trim();
        return edge;
      }),
    };
  }

  openAlternativesDialog(): void {
    const current = this.alternativesSelectionForDialog();
    const ref = this.dialog.open(AlternativesDialogComponent, {
      width: '80vw',
      maxWidth: '80vw',
      height: '80vh',
      maxHeight: '80vh',
      panelClass: 'migration-target-dialog-panel',
      data: { currentSelection: current.map((m) => ({ ...m })), currentAppId: this.guid() } satisfies {
        currentSelection: AlternativeItem[];
        currentAppId: string;
      },
    });
    ref.afterClosed().subscribe((result: AlternativeItem[] | undefined) => {
      if (result == null) return;
      const d = this.data();
      if (!d) return;
      d.alternatives = result.length === 0 ? undefined : this.alternativesToRelationData(result);
      this.onDataMutated()?.();
    });
  }

  /** Build RelationData from dialog result (MigrationTargetItem[]). */
  private migrationTargetToRelationData(items: MigrationTargetItem[]): RelationData {
    if (items.length === 0) return { edges: [] };
    return {
      edges: items.map((m) => {
        const edge: Record<string, unknown> = {
          node: { factSheet: { id: m.id, type: m.type ?? 'Application', displayName: m.displayName } },
        };
        if (m.lifecycle != null && m.lifecycle !== '') edge['lifecycle'] = m.lifecycle;
        if (m.proportion != null) edge['proportion'] = m.proportion;
        if (m.priority != null) edge['priority'] = m.priority;
        if (m.effort != null && m.effort !== '') edge['effort'] = m.effort;
        if (m.benefit != null && m.benefit !== '') edge['benefit'] = m.benefit;
        if (m.eta != null && m.eta !== '') edge['eta'] = m.eta;
        if (m.comments != null && m.comments !== '') edge['comments'] = m.comments;
        if (m.startDate != null && m.startDate !== '') edge['startDate'] = m.startDate;
        if (m.endDate != null && m.endDate !== '') edge['endDate'] = m.endDate;
        if (m.projectReference != null && m.projectReference !== '') edge['projectReference'] = m.projectReference;
        if (Array.isArray(m.userGroup) && m.userGroup.length > 0) {
          edge['userGroup'] = {
            edges: m.userGroup.map((ug) => ({
              node: { factSheet: { id: ug.id, type: 'UserGroup', displayName: ug.displayName } },
            })),
          };
        }
        return edge;
      }),
    };
  }

  openMigrationTargetDialog(): void {
    const current = this.migrationTargetSelectionForDialog();
    const ref = this.dialog.open(MigrationTargetDialogComponent, {
      width: '80vw',
      maxWidth: '80vw',
      height: '80vh',
      maxHeight: '80vh',
      panelClass: 'migration-target-dialog-panel',
      data: { currentSelection: current.map((m) => ({ ...m })), currentAppId: this.guid() } satisfies { currentSelection: MigrationTargetItem[]; currentAppId: string },
    });
    ref.afterClosed().subscribe((result: MigrationTargetItem[] | undefined) => {
      if (result == null) return;
      const d = this.data();
      if (!d) return;
      d.migrationTarget = result.length === 0 ? undefined : this.migrationTargetToRelationData(result);
      this.onDataMutated()?.();
    });
  }

  private relationEdgesToReferenceItems(rel: RelationData | undefined, targetType: ReferenceTargetType): ReferenceEditorItem[] {
    if (!rel || typeof rel !== 'object' || !Array.isArray(rel.edges)) return [];
    return rel.edges
      .map((edge) => {
        const fs = edge?.node?.factSheet as Record<string, unknown> | undefined;
        if (!fs || typeof fs !== 'object') return null;
        const idRaw = fs['id'];
        if (idRaw == null || String(idRaw).trim() === '') return null;
        const id = String(idRaw);
        const displayName = String(fs['displayName'] ?? fs['fullName'] ?? fs['name'] ?? id);
        const fullNameRaw = fs['fullName'];
        const fullName = fullNameRaw != null ? String(fullNameRaw) : undefined;
        const descriptionRaw = fs['description'];
        const description = typeof descriptionRaw === 'string' ? descriptionRaw : undefined;
        const itemType = (typeof fs['type'] === 'string' && fs['type']) ? (fs['type'] as ReferenceTargetType) : targetType;
        const coverage = typeof edge?.coverage === 'number' ? edge.coverage : undefined;
        const comments = typeof edge?.comments === 'string' ? edge.comments : undefined;
        const item: ReferenceEditorItem = {
          id,
          type: itemType,
          displayName,
          fullName,
          description,
        };
        if (coverage !== undefined) item.coverage = coverage;
        if (comments !== undefined) item.comments = comments;
        return item;
      })
      .filter((x): x is ReferenceEditorItem => x != null);
  }

  private referenceItemsToRelationData(items: ReferenceEditorItem[]): RelationData {
    return {
      edges: items.map((item) => {
        const factSheet: Record<string, unknown> = {
          id: item.id,
          type: item.type,
          displayName: item.displayName,
        };
        if (item.fullName != null && String(item.fullName).trim() !== '') factSheet['fullName'] = item.fullName;
        if (item.description != null && String(item.description).trim() !== '') factSheet['description'] = item.description;
        const edge: { node: { factSheet: Record<string, unknown> }; coverage?: number; comments?: string } = {
          node: { factSheet },
        };
        if (item.coverage != null) edge.coverage = item.coverage;
        if (item.comments != null && item.comments.trim() !== '') edge.comments = item.comments;
        return edge;
      }),
    };
  }

  openReferenceEditorDialog(relationKey: 'relApplicationToBusinessCapability' | 'relApplicationToDataProduct' | 'relApplicationToUserGroup' | 'relApplicationToPlatform', targetType: ReferenceTargetType): void {
    const d = this.data();
    if (!d) return;

    const currentRel = d[relationKey] as RelationData | undefined;
    const currentSelection = this.relationEdgesToReferenceItems(currentRel, targetType);

    const ref = this.dialog.open(ReferenceEditorDialogComponent, {
      width: '80vw',
      maxWidth: '80vw',
      height: '80vh',
      maxHeight: '80vh',
      panelClass: 'migration-target-dialog-panel',
      data: {
        targetType,
        currentSelection: currentSelection.map((m) => ({ ...m })),
        ...(targetType === 'BusinessCapability' ? { allBusinessCapabilities: this.bcTree.rawItems() } : {}),
      } satisfies ReferenceEditorDialogData,
    });

    ref.afterClosed().subscribe((result: ReferenceEditorItem[] | undefined) => {
      if (result == null) return;
      d[relationKey] = this.referenceItemsToRelationData(result);
      this.referenceRelationsVersion.update((v) => v + 1);
      this.onDataMutated()?.();
    });
  }
}
