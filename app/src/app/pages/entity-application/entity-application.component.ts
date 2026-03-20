import { Component, input, computed, signal, inject } from '@angular/core';
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
import { ApplicationsService } from '../../services/ApplicationsService';
import { FacetsService } from '../../services/FacetsService';
import { PLATFORM_TEMP_VALUES } from '../../models/platform-temp-values';
import { MigrationTargetDialogComponent } from '../../components/migration-target-dialog/migration-target-dialog.component';
import { MigrationTargetItem } from '../../models/migration-target-item';
import { ReferenceEditorDialogComponent } from '../../components/reference-editor-dialog/reference-editor-dialog.component';
import type { ReferenceEditorDialogData, ReferenceEditorItem, ReferenceTargetType } from '../../models/reference-editor-item';
import { TranslateModule } from '@ngx-translate/core';

/** Status dropdown options for application entity. */
export const APPLICATION_STATUS_OPTIONS = ['ACTIVE', 'INACTIVE'] as const;

/** Application lifecycle dropdown options. */
export const APPLICATION_LIFECYCLE_OPTIONS = ['phaseIn', 'active', 'phaseOut', 'endOfLife'] as const;

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
  /** Migration targets: edges notation (same as other relations). Legacy string/single object normalized on read. */
  migrationTarget?: RelationData | null;
  businessCriticality?: string;
  functionalSuitability?: string;
  functionalSuitabilityDescription?: string;
  technicalSuitability?: string;
  technicalSuitabilityDescription?: string;
  /** Relation: object with edges[] and each edge.node.factSheet (displayName, fullName, description). */
  relApplicationToPlatform?: RelationData;
  relApplicationToBusinessCapability?: RelationData;
  relApplicationToUserGroup?: RelationData;
  relToChild?: RelationData;
  relToParent?: RelationData;
  [key: string]: unknown;
}

/** Relation structure: edges[].node.factSheet with displayName, fullName, description. */
export interface RelationData {
  edges?: Array<{ node?: { factSheet?: Record<string, unknown> } }>;
}

/** Normalize migrationTarget to edges on read (legacy string or single object → single-value edge). */
function normalizeMigrationTargetToEdges(mt: unknown): RelationData | undefined {
  if (mt == null) return undefined;
  if (typeof mt === 'string') {
    return { edges: [{ node: { factSheet: { id: mt, type: 'Application', displayName: mt } } }] };
  }
  if (typeof mt === 'object' && mt !== null && !Array.isArray(mt)) {
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
function relationToPillItems(rel: RelationData | unknown): PillItem[] {
  if (!rel || typeof rel !== 'object' || !Array.isArray((rel as RelationData).edges)) return [];
  const edges = (rel as RelationData).edges!;
  return edges.map((edge) => {
    const factSheet = edge?.node?.factSheet;
    if (!factSheet || typeof factSheet !== 'object') return { label: '—' };
    const fs = factSheet as Record<string, unknown>;
    const label = String(fs['displayName'] ?? fs['fullName'] ?? fs['name'] ?? fs['id'] ?? '—');
    const title = typeof fs['description'] === 'string' ? fs['description'] : undefined;
    const color = typeof fs['color'] === 'string' ? fs['color'] : undefined;
    return { label, title, color };
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
    SuitabilityRatingComponent,
    TimeClassificationComponent,
    UserGroupPillComponent,
    MigrationTargetPillComponent,
    TranslateModule,
  ],
  templateUrl: './entity-application.component.html',
  styleUrl: './entity-application.component.scss',
})
export class EntityApplicationComponent {
  readonly applicationStatusOptions = APPLICATION_STATUS_OPTIONS;
  readonly applicationLifecycleOptions = APPLICATION_LIFECYCLE_OPTIONS;
  private applicationsService = inject(ApplicationsService);
  private facetsService = inject(FacetsService);

  private dialog = inject(MatDialog);

  guid = input.required<string>();
  data = input.required<ApplicationData | null>();
  /** Called when a child mutates data (e.g. suitability rating). Use to sync derived state (e.g. raw JSON). */
  onDataMutated = input<() => void>(() => {});

  /** Migration target edges from data (normalized on read: string/single object → edges). */
  private migrationTargetEdges = computed(() => {
    const d = this.data();
    const raw = d?.migrationTarget;
    return normalizeMigrationTargetToEdges(raw) ?? undefined;
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
      return {
        id: id != null && id !== '' ? String(id) : '',
        type: (fs?.['type'] as string) ?? 'Application',
        displayName: displayName != null ? String(displayName) : String(id ?? ''),
        lifecycle: rec['lifecycle'] != null && rec['lifecycle'] !== '' ? String(rec['lifecycle']) : undefined,
        proportion: typeof proportion === 'number' && !Number.isNaN(proportion) ? proportion : 100,
        priority: rec['priority'] != null && rec['priority'] !== '' ? (rec['priority'] as number) : undefined,
        effort: rec['effort'] != null && rec['effort'] !== '' ? String(rec['effort']) : undefined,
        eta: rec['eta'] != null && rec['eta'] !== '' ? String(rec['eta']) : undefined,
      };
    }).filter((m) => m.id !== '');
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
        if (m.eta) parts.push(String(m.eta));
        const bracket = parts.length ? ` [${parts.join(', ')}]` : '';
        return `${m.displayName}${bracket}`;
      })
      .filter(Boolean)
      .join(', ');
  });

  /** Bump after mutating description so computeds re-read from data. */
  private descriptionVersion = signal(0);

  /** Bump after mutating status so computed status() re-runs (data reference is unchanged). */
  private version = signal(0);
  /** Bump after mutating displayName so computed displayName() re-runs. */
  private displayNameVersion = signal(0);
  /** Bump after mutating earmarkingsTEMP so computed earmarkingsTEMP() re-runs. */
  private earmarkingsTempVersion = signal(0);
  /** Bump after mutating ApplicationLifecycle.asString so applicationLifecycleAsString re-runs. */
  private applicationLifecycleVersion = signal(0);
  /** Bump after mutating platformTEMP so platformTEMP() re-runs if needed. */
  private platformTempVersion = signal(0);
  /** Bump after mutating reference relations (link dialog) so pill computeds re-run. */
  private referenceRelationsVersion = signal(0);

  tagsPills = computed(() => {
    const d = this.data();
    const raw = d?.tags;
    if (!Array.isArray(raw)) return [];
    return raw.map((t: Record<string, unknown>) => ({
      label: String(t['name'] ?? t['label'] ?? t['description'] ?? '—'),
      color: typeof t['color'] === 'string' ? t['color'] : undefined,
      title: typeof t['description'] === 'string' ? t['description'] : undefined,
    }));
  });

  relApplicationToPlatformPills = computed(() => relationToPillItems(this.data()?.relApplicationToPlatform));
  relApplicationToBusinessCapabilityPills = computed(() => {
    this.referenceRelationsVersion();
    return relationToPillItems(this.data()?.relApplicationToBusinessCapability);
  });
  /** User group items from relApplicationToUserGroup edges: fullName (label), displayName (title + border/icon). */
  relApplicationToUserGroupItems = computed(() => {
    this.referenceRelationsVersion();
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
  relToChildPills = computed(() => relationToPillItems(this.data()?.relToChild));
  relToParentPills = computed(() => relationToPillItems(this.data()?.relToParent));

  displayName = computed(() => {
    this.displayNameVersion();
    return this.data()?.displayName ?? '';
  });

  description = computed(() => {
    this.descriptionVersion();
    return this.data()?.description ?? '';
  });
  earmarkingsTEMP = computed(() => {
    this.earmarkingsTempVersion();
    return this.data()?.earmarkingsTEMP ?? '';
  });
  status = computed(() => {
    this.version();
    return this.data()?.status ?? '';
  });

  onStatusChange(value: string): void {
    const d = this.data();
    if (!d) return;
    d.status = value;
    this.version.update((v) => v + 1);
    this.onDataMutated()?.();
  }

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

  onDisplayNameChange(value: string): void {
    const d = this.data();
    if (!d) return;
    d.displayName = value ?? '';
    this.displayNameVersion.update((v) => v + 1);
    this.onDataMutated()?.();
  }

  onEarmarkingsTempChange(value: string): void {
    const d = this.data();
    if (!d) return;
    d.earmarkingsTEMP = value ?? '';
    this.earmarkingsTempVersion.update((v) => v + 1);
    this.onDataMutated()?.();
  }

  onDescriptionChange(value: string): void {
    const d = this.data();
    if (!d) return;
    d.description = value ?? '';
    this.descriptionVersion.update((v) => v + 1);
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
    this.descriptionVersion();
    return this.data()?.lxTimeClassificationDescription ?? '';
  });
  businessCriticality = computed(() => this.data()?.businessCriticality ?? '');
  functionalSuitability = computed(() => this.data()?.functionalSuitability ?? '');
  functionalSuitabilityDescription = computed(() => {
    this.descriptionVersion();
    return this.data()?.functionalSuitabilityDescription ?? '';
  });
  technicalSuitability = computed(() => this.data()?.technicalSuitability ?? '');
  technicalSuitabilityDescription = computed(() => {
    this.descriptionVersion();
    return this.data()?.technicalSuitabilityDescription ?? '';
  });

  platformTEMP = computed(() => {
    this.platformTempVersion();
    return (this.data()?.['platformTEMP'] as string | undefined) ?? '';
  });

  platformTempOptions = computed(() => {
    this.facetsService.data();
    const raw = this.facetsService.getFacet('platformTEMP');
    if (Array.isArray(raw) && raw.every((v) => typeof v === 'string')) {
      return (raw as string[]).slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }
    return PLATFORM_TEMP_VALUES.slice();
  });

  onFunctionalSuitabilityDescriptionChange(value: string): void {
    const d = this.data();
    if (d && typeof d === 'object') {
      d['functionalSuitabilityDescription'] = value;
      this.descriptionVersion.update((v) => v + 1);
      this.onDataMutated()?.();
    }
  }

  onTechnicalSuitabilityDescriptionChange(value: string): void {
    const d = this.data();
    if (d && typeof d === 'object') {
      d['technicalSuitabilityDescription'] = value;
      this.descriptionVersion.update((v) => v + 1);
      this.onDataMutated()?.();
    }
  }

  onLxTimeClassificationDescriptionChange(value: string): void {
    const d = this.data();
    if (d && typeof d === 'object') {
      d['lxTimeClassificationDescription'] = value;
      this.descriptionVersion.update((v) => v + 1);
      this.onDataMutated()?.();
    }
  }

  onPlatformTempChange(value: string): void {
    const d = this.data();
    if (d && typeof d === 'object') {
      (d as Record<string, unknown>)['platformTEMP'] = value || undefined;
      this.platformTempVersion.update((v) => v + 1);
      this.onDataMutated()?.();
    }
  }

  /** Whether this app is in TIME classification "migrate" (controls Migration Target styling). */
  isMigrationMigrate = computed(() => (this.data()?.lxTimeClassification ?? '').toString().toLowerCase() === 'migrate');

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
        if (m.eta != null && m.eta !== '') edge['eta'] = m.eta;
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
        return {
          id,
          type: itemType,
          displayName,
          fullName,
          description,
        } satisfies ReferenceEditorItem;
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
        return {
          node: { factSheet },
        };
      }),
    };
  }

  openReferenceEditorDialog(relationKey: 'relApplicationToBusinessCapability' | 'relApplicationToUserGroup', targetType: ReferenceTargetType): void {
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
      data: { targetType, currentSelection: currentSelection.map((m) => ({ ...m })) } satisfies ReferenceEditorDialogData,
    });

    ref.afterClosed().subscribe((result: ReferenceEditorItem[] | undefined) => {
      if (result == null) return;
      d[relationKey] = this.referenceItemsToRelationData(result);
      this.referenceRelationsVersion.update((v) => v + 1);
      this.onDataMutated()?.();
    });
  }
}
