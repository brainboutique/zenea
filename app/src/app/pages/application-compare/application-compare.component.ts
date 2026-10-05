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

import { Component, OnInit, signal, computed, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { EntityApiService } from '../../services/entity-api.service';
import { UserConfigService } from '../../services/user-config.service';
import { ModelDefinitionsService, CustomFieldDefinition, ModelDefinitionsResponse, formatCustomNumber } from '../../services/model-definitions.service';
import { TagsService } from '../../services/TagsService';
import { PillsComponent } from '../../components/pills/pills.component';
import { PillItem } from '../../components/pills/pill-item';
import { SuitabilityRatingComponent } from '../../components/suitability-rating/suitability-rating.component';
import { TimeClassificationComponent } from '../../components/time-classification/time-classification.component';
import { MigrationTargetPillComponent } from '../../components/migration-target-pill/migration-target-pill.component';
import { AlternativesPillComponent } from '../../components/alternatives-pill/alternatives-pill.component';
import { EditFieldComponent, EditFieldData, EditFieldType } from '../../components/edit-field/edit-field.component';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { subscriptionTypeColor } from '../../models/subscription-item';
import type { MigrationTargetItem } from '../../models/migration-target-item';
import type { AlternativeItem } from '../../models/alternative-item';
import { VirtualAttributeService } from '../../services/virtual-attribute.service';

export interface ApplicationData {
  type?: string;
  displayName?: string;
  description?: string | null;
  earmarkingsTEMP?: string;
  tags?: Array<{ name?: string; label?: string; description?: string; color?: string; tagGroupId?: string; tagGroup?: { id?: string } }>;
  status?: string;
  qualitySeal?: string | boolean;
  ApplicationLifecycle?: { asString?: string };
  lxTimeClassification?: string | null;
  lxTimeClassificationDescription?: string;
  northStarClassification?: string | null;
  northStarClassificationDescription?: string;
  migrationTarget?: unknown;
  alternatives?: unknown;
  businessCriticality?: string;
  functionalSuitability?: string;
  functionalSuitabilityDescription?: string;
  technicalSuitability?: string;
  technicalSuitabilityDescription?: string;
  cost?: number | null;
  costUnit?: string | null;
  relApplicationToPlatform?: { edges?: Array<{ node?: { factSheet?: Record<string, unknown> } }> };
  relApplicationToBusinessCapability?: { edges?: Array<{ node?: { factSheet?: Record<string, unknown> } }> };
  relApplicationToUserGroup?: { edges?: Array<{ node?: { factSheet?: Record<string, unknown> } }> };
  relApplicationToDataProduct?: { edges?: Array<{ node?: { factSheet?: Record<string, unknown> } }> };
  relToChild?: { edges?: Array<{ node?: { factSheet?: Record<string, unknown> } }> };
  relToParent?: { edges?: Array<{ node?: { factSheet?: Record<string, unknown> } }> };
  [key: string]: unknown;
}

interface BcCellInfo {
  linked: boolean;
  coverage?: number | null;
  comments?: string | null;
}

interface CompareRow {
  kind: 'attribute' | 'core-subheader' | 'bc-subheader' | 'bc-value' | 'ug-subheader' | 'ug-value' | 'others-subheader';
  attributeId?: string;
  label: string;
  values: (string | null)[];
  bcCellData?: BcCellInfo[];
}

const TOGGLEABLE_COLUMNS: { id: string; label: string }[] = [
  { id: 'earmarkingsTEMP', label: 'Earmarkings' },
  { id: 'lxTimeClassification', label: 'TIME' },
  { id: 'migrationTarget', label: 'Migration target' },
  { id: 'alternatives', label: 'Alternatives' },
  { id: 'functionalSuitability', label: 'Functional suitability' },
  { id: 'technicalSuitability', label: 'Technical suitability' },
  { id: 'businessCriticality', label: 'Business criticality' },
  { id: 'relApplicationToDataProduct', label: 'Data Products' },
];

@Component({
  selector: 'app-application-compare',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    PillsComponent,
    SuitabilityRatingComponent,
    TimeClassificationComponent,
    MigrationTargetPillComponent,
    AlternativesPillComponent,
    EditFieldComponent,
  ],
  templateUrl: './application-compare.component.html',
  styleUrl: './application-compare.component.scss',
})
export class ApplicationCompareComponent implements OnInit {
  loading = signal(true);
  error = signal<string | null>(null);
  apps = signal<ApplicationData[]>([]);
  customFields = signal<Record<string, CustomFieldDefinition>>({});

  /** Which sub-header sections are expanded (by row index in compareRows). All expanded by default. */
  expandedSections = signal<Set<number>>(new Set());
  /** When true, only show rows where at least one app differs from another. */
  onlyDifferences = signal(false);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private entityApi = inject(EntityApiService);
  private userConfig = inject(UserConfigService);
  private modelDefinitionsService = inject(ModelDefinitionsService);
  private tagsService = inject(TagsService);
  private virtualAttributeService = inject(VirtualAttributeService);

  private _expandedInitDone = false;

  constructor() {
    effect(() => {
      const rows = this.compareRows();
      if (rows.length > 0 && !this._expandedInitDone) {
        this._expandedInitDone = true;
        const subHeaderIndices = rows
          .map((r, i) => (r.kind === 'core-subheader' || r.kind === 'bc-subheader' || r.kind === 'ug-subheader' || r.kind === 'others-subheader') ? i : -1)
          .filter(i => i >= 0);
        this.expandedSections.set(new Set(subHeaderIndices));
      }
    });
  }

  ngOnInit(): void {
    const ids = (this.route.snapshot.queryParamMap.get('ids') ?? '').split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) {
      this.error.set('No application IDs provided.');
      this.loading.set(false);
      return;
    }

    const defs$ = this.modelDefinitionsService.getModelDefinitions();

    const requests = ids.map(id =>
      this.entityApi.getEntity(id, 'Application').pipe(
        map(data => data as ApplicationData),
        catchError(() => of(null))
      )
    );

    forkJoin({
      defs: defs$,
      apps: forkJoin(requests),
    }).subscribe({
      next: ({ defs, apps: results }) => {
        const appDef = defs['Application'];
        if (appDef?.customFields) this.customFields.set(appDef.customFields);
        const valid = results.filter((r): r is ApplicationData => r != null);
        this.computeVirtualAttrs(valid, appDef?.customFields ?? {});
        this.apps.set(valid);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load application data.');
        this.loading.set(false);
      },
    });
  }

  readonly compareRows = computed((): CompareRow[] => {
    const apps = this.apps();
    if (apps.length === 0) return [];

    const rows: CompareRow[] = [];
    const cfDefs = this.customFields();
    const tagGroups = this.tagsService.data();

    const coreRows: CompareRow[] = [];
    for (const col of TOGGLEABLE_COLUMNS) {
      const hasAny = apps.some(a => this.hasData(a, col.id));
      if (!hasAny) continue;
      coreRows.push({
        kind: 'attribute',
        attributeId: col.id,
        label: col.label,
        values: apps.map(a => this.getCellValue(a, col.id)),
      });
    }

    if (coreRows.length > 0) {
      rows.push({ kind: 'core-subheader', label: 'Core', values: [] });
      rows.push(...coreRows);
    }

    const bcValues = this.collectUniqueRelationValues(apps, 'relApplicationToBusinessCapability');
    if (bcValues.length > 0) {
      rows.push({ kind: 'bc-subheader', label: 'Business Capabilities', values: [] });
      for (const val of bcValues) {
        const bcCellData = apps.map(a => this.getRelationEdgeData(a, 'relApplicationToBusinessCapability', val.id));
        rows.push({
          kind: 'bc-value',
          label: val.label,
          values: bcCellData.map(d => d.linked ? '✓' : null),
          bcCellData,
        });
      }
    }

    const ugValues = this.collectUniqueRelationValues(apps, 'relApplicationToUserGroup');
    if (ugValues.length > 0) {
      rows.push({ kind: 'ug-subheader', label: 'User Group', values: [] });
      for (const val of ugValues) {
        rows.push({
          kind: 'ug-value',
          label: val.label,
          values: apps.map(a => this.hasRelationValue(a, 'relApplicationToUserGroup', val.id) ? '✓' : null),
        });
      }
    }

    const otherRows: CompareRow[] = [];
    for (const [key, def] of Object.entries(cfDefs)) {
      const hasAny = apps.some(a => this.hasCustomFieldData(a, key));
      if (!hasAny) continue;
      otherRows.push({
        kind: 'attribute',
        attributeId: key,
        label: (def.label?.['en'] ?? def.label?.[Object.keys(def.label)[0]]) ?? key,
        values: apps.map(a => this.getCustomFieldValue(a, key)),
      });
    }

    for (const tg of tagGroups) {
      const groupId = tg.id;
      if (!groupId) continue;
      const colId = `tag_${groupId}`;
      const hasAny = apps.some(a => this.hasTagData(a, groupId));
      if (!hasAny) continue;
      otherRows.push({
        kind: 'attribute',
        attributeId: colId,
        label: `Tag: ${tg.displayName}`,
        values: apps.map(a => this.getTagValue(a, groupId)),
      });
    }

    if (otherRows.length > 0) {
      rows.push({ kind: 'others-subheader', label: 'Others', values: [] });
      rows.push(...otherRows);
    }

    return rows;
  });

  /** Rows after applying expand/collapse and only-differences filtering. */
  readonly visibleCompareRows = computed((): CompareRow[] => {
    const allRows = this.compareRows();
    const expanded = this.expandedSections();
    const diffsOnly = this.onlyDifferences();
    if (!diffsOnly && expanded.size === 0 && allRows.length === 0) return [];

    const result: CompareRow[] = [];
    let skipChildren = false;
    let pendingSubHeader: CompareRow | null = null;
    let pendingChildCount = 0;

    const isSubHeader = (kind: string) =>
      kind === 'core-subheader' || kind === 'bc-subheader' || kind === 'ug-subheader' || kind === 'others-subheader';

    const flushPending = () => {
      if (pendingSubHeader) {
        result.splice(result.length - pendingChildCount, 0, pendingSubHeader);
        pendingSubHeader = null;
        pendingChildCount = 0;
      }
    };

    for (const row of allRows) {
      if (isSubHeader(row.kind)) {
        flushPending();
        const rawIdx = allRows.indexOf(row);
        skipChildren = !expanded.has(rawIdx);
        pendingSubHeader = row;
        pendingChildCount = 0;
        continue;
      }

      if (skipChildren) continue;

      if (diffsOnly) {
        if (row.kind === 'attribute' && this.isAllValuesSame(row.values)) continue;
        if ((row.kind === 'bc-value' || row.kind === 'ug-value') && this.isAllValuesSame(row.values)) continue;
      }

      result.push(row);
      pendingChildCount++;
    }

    flushPending();
    return result;
  });

  /** Check if all values in an array are identical (ignoring null/undefined for "no data"). */
  private isAllValuesSame(values: (string | null)[]): boolean {
    if (values.length <= 1) return true;
    const first = values[0];
    return values.every(v => v === first);
  }

  /** Toggle expand/collapse for a sub-header section. */
  toggleSection(rowIndex: number): void {
    const next = new Set(this.expandedSections());
    if (next.has(rowIndex)) {
      next.delete(rowIndex);
    } else {
      next.add(rowIndex);
    }
    this.expandedSections.set(next);
  }

  /** Check if a sub-header section is expanded. */
  isSectionExpanded(rowIndex: number): boolean {
    return this.expandedSections().has(rowIndex);
  }

  /** Map a visible row index to the raw row index in compareRows for expand/collapse tracking. */
  getRawRowIndex(_visibleIndex: number, row: CompareRow): number {
    return this.compareRows().indexOf(row);
  }

  openApp(guid: string): void {
    window.open(this.userConfig.projectUrlString(`entity/Application/${guid}`), '_blank');
  }

  goBack(): void {
    window.close();
  }

  /** Returns the square icon character for a BC cell based on its coverage. */
  getCoverageIcon(cell: BcCellInfo): string {
    if (!cell.linked) return '\u25A1'; // □ empty square (not linked)
    if (cell.coverage === 0) return '\u25A1'; // □ empty square (linked but 0%)
    if (cell.coverage != null && cell.coverage >= 10 && cell.coverage <= 90) return '\u25E9'; // ◩ half-filled
    return '\u25A0'; // ■ filled square (linked, high coverage or no coverage set)
  }

  getAppId(app: ApplicationData): string {
    return String((app as Record<string, unknown>)['id'] ?? '');
  }

  asRecord(data: ApplicationData): Record<string, unknown> {
    return data as Record<string, unknown>;
  }

  getMigrationTargetItems(data: ApplicationData): MigrationTargetItem[] {
    const raw = data.migrationTarget;
    if (raw == null) return [];
    if (Array.isArray(raw)) {
      return raw.map((item: any) => ({
        id: String(item?.id ?? ''),
        type: (item?.type as string) ?? 'Application',
        displayName: String(item?.displayName ?? item?.id ?? ''),
        lifecycle: item?.lifecycle ?? undefined,
        proportion: typeof item?.proportion === 'number' ? item.proportion : 100,
        priority: item?.priority ?? undefined,
        effort: item?.effort ?? undefined,
        benefit: item?.benefit ?? undefined,
        eta: item?.eta ?? undefined,
        comments: item?.comments ?? undefined,
        userGroup: item?.userGroup ?? null,
      })).filter((m: MigrationTargetItem) => m.id !== '');
    }
    if (typeof raw === 'object' && 'edges' in (raw as any)) {
      const edges = (raw as any).edges ?? [];
      return edges.map((edge: any) => {
        const fs = edge?.node?.factSheet ?? {};
        return {
          id: String(fs.id ?? ''),
          type: (fs.type as string) ?? 'Application',
          displayName: String(fs.displayName ?? fs.id ?? ''),
          lifecycle: edge.lifecycle ?? undefined,
          proportion: typeof edge.proportion === 'number' ? edge.proportion : 100,
          priority: edge.priority ?? undefined,
          effort: edge.effort ?? undefined,
          benefit: edge.benefit ?? undefined,
          eta: edge.eta ?? undefined,
          comments: edge.comments ?? undefined,
          userGroup: edge.userGroup ?? null,
        };
      }).filter((m: MigrationTargetItem) => m.id !== '');
    }
    return [];
  }

  getAlternativesItems(data: ApplicationData): AlternativeItem[] {
    const raw = data.alternatives;
    if (raw == null) return [];
    if (Array.isArray(raw)) {
      return raw.map((item: any) => ({
        id: String(item?.id ?? ''),
        type: (item?.type as string) ?? 'Application',
        displayName: String(item?.displayName ?? item?.id ?? ''),
        functionalOverlap: typeof item?.functionalOverlap === 'number' ? item.functionalOverlap : 100,
        comment: item?.comment ?? '',
      })).filter((m: AlternativeItem) => m.id !== '');
    }
    if (typeof raw === 'object' && 'edges' in (raw as any)) {
      const edges = (raw as any).edges ?? [];
      return edges.map((edge: any) => {
        const fs = edge?.node?.factSheet ?? {};
        return {
          id: String(fs.id ?? ''),
          type: (fs.type as string) ?? 'Application',
          displayName: String(fs.displayName ?? fs.id ?? ''),
          functionalOverlap: typeof edge.functionalOverlap === 'number' ? edge.functionalOverlap : 100,
          comment: edge.comment ?? '',
        };
      }).filter((m: AlternativeItem) => m.id !== '');
    }
    return [];
  }

  getDataProductPills(data: ApplicationData): PillItem[] {
    const rel = data.relApplicationToDataProduct;
    if (!rel || !Array.isArray(rel.edges)) return [];
    return rel.edges.map((edge) => {
      const fs = edge?.node?.factSheet;
      if (!fs) return { label: '—' };
      return { label: String(fs['displayName'] ?? fs['fullName'] ?? fs['id'] ?? '—') };
    });
  }

  getSubscriptionPills(data: ApplicationData): { label: string; color: string; title: string }[] {
    const raw = (data as Record<string, unknown>)['subscriptions'];
    if (raw == null || typeof raw !== 'object') return [];
    const rec = raw as Record<string, unknown>;
    const edges = Array.isArray(rec['edges']) ? rec['edges'] : [];
    return edges
      .map((edge: Record<string, unknown>) => {
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
        };
      })
      .filter((p): p is { label: string; color: string; title: string } => p != null);
  }

  getCustomFieldType(key: string): EditFieldType {
    const def = this.customFields()[key];
    if (!def) return 'text';
    switch (def.type) {
      case 'number': return 'number';
      case 'textarea': return 'textarea';
      case 'selectSingle': return 'selectSingle';
      case 'selectMultiple': return 'selectMultiple';
      case 'link': return 'link';
      case 'virtual': return 'text';
      default: return 'text';
    }
  }

  getCustomFieldOptions(key: string): string[] {
    return this.customFields()[key]?.values ?? [];
  }

  getCustomFieldUom(key: string): string {
    return this.customFields()[key]?.uom ?? '';
  }

  isNumberField(key: string): boolean {
    const def = this.customFields()[key];
    if (def?.type === 'number') return true;
    if (def?.type !== 'virtual') return false;
    const firstApp = this.apps()[0];
    if (!firstApp) return false;
    const val = (firstApp as Record<string, unknown>)[key];
    return typeof val === 'number';
  }

  formatNumberWithUom(data: ApplicationData, key: string): string {
    const val = (data as Record<string, unknown>)[key];
    if (val == null || val === '') return '—';
    const num = Number(val);
    if (Number.isNaN(num)) return String(val);
    const formatted = formatCustomNumber(num, this.customFields()[key]?.format);
    const uom = this.customFields()[key]?.uom;
    return uom ? `${formatted} ${uom}` : formatted;
  }

  getCustomFieldLinkUrl(key: string, data: ApplicationData): string {
    const def = this.customFields()[key];
    if (!def?.templateTarget) return '';
    return def.templateTarget.replace(/\$\{(\w+)\}/g, (_match, prop) => {
      const val = (data as Record<string, unknown>)[prop];
      return val != null ? String(val) : '';
    });
  }

  getCustomFieldLinkText(key: string): string {
    return this.customFields()[key]?.templateLabel ?? '';
  }

  getTagValue(data: ApplicationData, tagGroupId: string): string | null {
    const tags = data.tags;
    if (!Array.isArray(tags)) return null;
    const matching = tags.filter(t => this.isTagInGroup(t, tagGroupId));
    if (matching.length === 0) return null;
    return matching.map(t => t.name ?? '').join(', ');
  }

  getTagPills(data: ApplicationData, tagGroupId: string): { name: string; color: string | null }[] {
    const tags = data.tags;
    if (!Array.isArray(tags)) return [];
    return tags.filter(t => this.isTagInGroup(t, tagGroupId)).map(t => ({
      name: t.name ?? '',
      color: t.color ?? null,
    }));
  }

  hasTagPills(data: ApplicationData, tagGroupId: string): boolean {
    const tags = data.tags;
    if (!Array.isArray(tags)) return false;
    return tags.some(t => this.isTagInGroup(t, tagGroupId));
  }

  private isTagInGroup(tag: { id?: string; tagGroupId?: string; tagGroup?: { id?: string } }, groupId: string): boolean {
    if (tag.tagGroupId === groupId) return true;
    const nested = tag.tagGroup;
    if (nested && typeof nested === 'object' && nested.id === groupId) return true;
    const allMasterTags = this.tagsService.getAllTags();
    const masterTag = allMasterTags.find(mt => mt.id === tag.id);
    return !!masterTag && masterTag.tagGroupId === groupId;
  }

  private hasData(data: ApplicationData, colId: string): boolean {
    const val = this.getCellValue(data, colId);
    return val !== null && val !== '';
  }

  private getCellValue(data: ApplicationData, colId: string): string | null {
    switch (colId) {
      case 'earmarkingsTEMP': return data.earmarkingsTEMP ?? null;
      case 'lxTimeClassification': return data.lxTimeClassification ?? null;
      case 'migrationTarget': return this.getMigrationTargetItems(data).length > 0 ? 'has-data' : null;
      case 'alternatives': return this.getAlternativesItems(data).length > 0 ? 'has-data' : null;
      case 'functionalSuitability': return data.functionalSuitability ?? null;
      case 'technicalSuitability': return data.technicalSuitability ?? null;
      case 'businessCriticality': return data.businessCriticality ?? null;
      case 'relApplicationToDataProduct': return this.getDataProductPills(data).length > 0 ? 'has-data' : null;
      case 'subscriptions': return this.getSubscriptionPills(data).length > 0 ? 'has-data' : null;
      default: return null;
    }
  }

  private computeVirtualAttrs(apps: ApplicationData[], cfDefs: Record<string, CustomFieldDefinition>): void {
    const virtualDefs: Record<string, CustomFieldDefinition> = {};
    for (const [key, def] of Object.entries(cfDefs)) {
      if (def.type === 'virtual' && def.formula) {
        virtualDefs[key] = def;
      }
    }
    if (Object.keys(virtualDefs).length === 0) return;
    for (const app of apps) {
      this.virtualAttributeService.computeVirtualAttributes(app as Record<string, unknown>, virtualDefs);
    }
  }

  private hasCustomFieldData(data: ApplicationData, key: string): boolean {
    const val = (data as Record<string, unknown>)[key];
    return val != null && val !== '';
  }

  private getCustomFieldValue(data: ApplicationData, key: string): string | null {
    const val = (data as Record<string, unknown>)[key];
    if (val == null) return null;
    return String(val);
  }

  private hasTagData(data: ApplicationData, tagGroupId: string): boolean {
    return this.hasTagPills(data, tagGroupId);
  }

  private collectUniqueRelationValues(apps: ApplicationData[], field: string): { id: string; label: string }[] {
    const map = new Map<string, string>();
    for (const app of apps) {
      const rel = (app as Record<string, unknown>)[field] as { edges?: Array<{ node?: { factSheet?: Record<string, unknown> } }> } | undefined;
      if (!rel?.edges) continue;
      for (const edge of rel.edges) {
        const fs = edge?.node?.factSheet;
        if (!fs) continue;
        const id = String(fs['id'] ?? '');
        const label = String(fs['displayName'] ?? fs['fullName'] ?? fs['name'] ?? id);
        if (id && !map.has(id)) map.set(id, label);
      }
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }

  private hasRelationValue(data: ApplicationData, field: string, targetId: string): boolean {
    const rel = (data as Record<string, unknown>)[field] as { edges?: Array<{ node?: { factSheet?: Record<string, unknown> } }> } | undefined;
    if (!rel?.edges) return false;
    return rel.edges.some(edge => {
      const fs = edge?.node?.factSheet;
      return fs && String(fs['id'] ?? '') === targetId;
    });
  }

  private getRelationEdgeData(data: ApplicationData, field: string, targetId: string): BcCellInfo {
    const rel = (data as Record<string, unknown>)[field] as { edges?: Array<{ node?: { factSheet?: Record<string, unknown> }; coverage?: number | null; comments?: string | null }> } | undefined;
    if (!rel?.edges) return { linked: false };
    for (const edge of rel.edges) {
      const fs = edge?.node?.factSheet;
      if (fs && String(fs['id'] ?? '') === targetId) {
        return {
          linked: true,
          coverage: typeof edge.coverage === 'number' ? edge.coverage : null,
          comments: typeof edge.comments === 'string' ? edge.comments : null,
        };
      }
    }
    return { linked: false };
  }
}
