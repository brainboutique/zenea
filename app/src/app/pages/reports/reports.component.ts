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

import { Component, inject, OnInit, OnDestroy, signal, computed, effect, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe } from '@ngx-translate/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { ListFiltersComponent, SUITABILITY_FILTER_EMPTY, parseVisiblePills } from '../../components/list-filters/list-filters.component';
import { ApplicationsService, ApplicationItem } from '../../services/ApplicationsService';
import { ModelDefinitionsService, CustomFieldDefinition, formatCustomNumber } from '../../services/model-definitions.service';
import { TagsService, TagGroupItem } from '../../services/TagsService';
import { PageTitleService } from '../../services/page-title.service';
import { EntityListFilters, emptyEntityListFilters } from '../../models/entity-list-filters';
import { SUITABILITY_VALUES, CRITICALITY_VALUES } from '../../components/suitability-rating/suitability-rating.component';
import { TIME_CLASSIFICATION_VALUES } from '../../components/time-classification/time-classification.component';
import { NORTH_STAR_CLASSIFICATION_VALUES } from '../../components/north-star-classification/north-star-classification.component';

const TIME_LABELS: Record<string, string> = { tolerate: 'Tolerate', invest: 'Invest', migrate: 'Migrate', eliminate: 'Eliminate' };
const SUITABILITY_LABELS: Record<string, string> = { inappropriate: 'Inappropriate', unreasonable: 'Unreasonable', adequate: 'Adequate', fullyAppropriate: 'Fully appropriate' };
const CRITICALITY_LABELS: Record<string, string> = { administrativeService: 'Administrative service', businessOperational: 'Business operational', businessCritical: 'Business critical', missionCritical: 'Mission critical' };
const NORTH_STAR_LABELS: Record<string, string> = { northStar: 'North Star', candidateNorthStar: 'Candidate', disputedNorthStar: 'Disputed' };
const ENUM_LABEL_MAP: Record<string, Record<string, string>> = {
  lxTimeClassification: TIME_LABELS,
  functionalSuitability: SUITABILITY_LABELS,
  technicalSuitability: SUITABILITY_LABELS,
  businessCriticality: CRITICALITY_LABELS,
  northStarClassification: NORTH_STAR_LABELS,
};

interface BuiltInAttr {
  id: string;
  label: string;
  kind: 'enum';
  values: string[];
}

const BUILT_IN_ATTRS: BuiltInAttr[] = [
  { id: 'lxTimeClassification', label: 'TIME', kind: 'enum', values: [...TIME_CLASSIFICATION_VALUES] },
  { id: 'functionalSuitability', label: 'Functional Suitability', kind: 'enum', values: [...SUITABILITY_VALUES, SUITABILITY_FILTER_EMPTY] },
  { id: 'technicalSuitability', label: 'Technical Suitability', kind: 'enum', values: [...SUITABILITY_VALUES, SUITABILITY_FILTER_EMPTY] },
  { id: 'businessCriticality', label: 'Business Criticality', kind: 'enum', values: [...CRITICALITY_VALUES, SUITABILITY_FILTER_EMPTY] },
  { id: 'northStarClassification', label: 'North Star', kind: 'enum', values: [...NORTH_STAR_CLASSIFICATION_VALUES, SUITABILITY_FILTER_EMPTY] },
];

interface XSource {
  key: string;
  label: string;
  kind: 'count' | 'enum' | 'number';
}

interface ReportColumn {
  key: string;
  label: string;
  sourceKey: string;
  kind: 'count' | 'enum' | 'number';
  value?: string;
  numericKey?: string;
}

/** A cell in the top header row (Y-dimension label). */
interface HeaderCell1 {
  label: string;
  colspan: number;
}

/** A cell in the middle header row (enum value group headers). */
interface HeaderCell2 {
  label: string;
  colspan: number;
  sourceKey: string;
  removable: boolean;
  /** The enum value this group represents (for group-start styling). */
  groupValue?: string;
}

/** A cell in the bottom header row (value source sub-headers). */
interface HeaderCell3 {
  label: string;
  colKey: string;
}

interface CellData {
  v: number | string;
  raw?: number;
  title?: string;
}

interface HistogramStack {
  yValue: string;
  count: number;
  valueSum: number;
  cumulativeCount: number;
  cumulativeValue: number;
  color: string;
  apps: { name: string; value: string }[];
}

interface HistogramBucket {
  min: number;
  max: number;
  stacks: HistogramStack[];
  total: number;
}

interface HistogramColumnData {
  columnKey: string;
  columnLabel: string;
  min: number;
  max: number;
  buckets: HistogramBucket[];
  yValues: string[];
}

interface ValueSource {
  key: string;
  label: string;
  kind: 'number' | 'count';
}

type AggMode = 'Sum' | 'Average' | 'Max' | 'Min';
type BarHeightMode = 'Sum' | 'Count';

interface ReportConfig {
  y?: string;
  x?: string[];
  agg?: AggMode;
  style?: 'table' | 'marimekko' | 'radiant' | 'histogram' | 'sunburst';
  buckets?: number;
  barHeight?: BarHeightMode;
}

const REPORT_QP = 'report';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    ListFiltersComponent,
    TranslatePipe,
    NgxEchartsDirective,
  ],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
})
export class ReportsComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private pageTitleService = inject(PageTitleService);
  private applicationsService = inject(ApplicationsService);
  private modelDefinitionsService = inject(ModelDefinitionsService);
  private tagsService = inject(TagsService);
  private snackBar = inject(MatSnackBar);
  private cdr = inject(ChangeDetectorRef);

  readonly yOptions = signal<{ id: string; label: string }[]>([]);
  readonly Math = Math;
  readonly yDimension = signal<string>('');
  readonly xSources = signal<XSource[]>([{ key: 'count', label: 'Count', kind: 'count' }]);
  readonly aggMode = signal<AggMode>('Sum');
  readonly displayStyle = signal<'table' | 'marimekko' | 'radiant' | 'histogram' | 'sunburst'>('table');
  readonly numBuckets = signal(25);
  readonly barHeightMode = signal<BarHeightMode>('Sum');

  readonly xDimension = signal<string>('');
  readonly values = signal<ValueSource[]>([{ key: 'count', label: 'Count', kind: 'count' }]);
  readonly visualMode = signal<boolean>(true);

  readonly hasNumericXColumns = computed(() => this.xSources().some(s => s.kind === 'number'));

  readonly expandedColumns = computed<ReportColumn[]>(() => {
    const sources = this.xSources();
    const xdKey = this.xDimension();
    const cols: ReportColumn[] = [];

    const enumSources = sources.filter(s => s.kind === 'enum');
    const valueSources = sources.filter(s => s.kind !== 'enum');

    if (enumSources.length > 0 && valueSources.length > 0) {
      for (const enumSrc of enumSources) {
        for (const v of this.getXEnumValues(enumSrc.key)) {
          for (const valSrc of valueSources) {
            const label = valSrc.key === 'count' ? 'Count' : this.getNumericLabel(valSrc.key);
            cols.push({ key: `${enumSrc.key}::${v}::${valSrc.key}`, label, sourceKey: enumSrc.key, kind: valSrc.kind, value: v, numericKey: valSrc.key });
          }
        }
      }
      for (const valSrc of valueSources) {
        const label = xdKey
          ? (valSrc.key === 'count' ? 'Total' : `Total - ${this.getNumericLabel(valSrc.key)}`)
          : (valSrc.key === 'count' ? 'Count' : this.getNumericLabel(valSrc.key));
        cols.push({ key: valSrc.key, label, sourceKey: valSrc.key, kind: valSrc.kind });
      }
    } else {
      for (const src of sources) {
        if (src.kind === 'count') {
          cols.push({ key: 'count', label: 'Count', sourceKey: 'count', kind: 'count' });
        } else if (src.kind === 'number') {
          cols.push({ key: src.key, label: this.getNumericLabel(src.key), sourceKey: src.key, kind: 'number' });
        }
      }
    }

    return cols;
  });

  readonly effectiveColumns = computed<ReportColumn[]>(() => {
    return this.expandedColumns().filter(c => {
      if (c.value) {
        return !this.isEnumValueExcluded(c.sourceKey, c.value);
      }
      return true;
    });
  });

  readonly marimekkoData = computed(() => {
    const rows = this.reportData();
    if (rows.length === 0) return [];

    const allCols = this.effectiveColumns();
    const xdKey = this.xDimension();
    const nonTotalIndices = allCols
      .map((c, i) => c.value ? i : -1)
      .filter(i => i >= 0);
    const nonTotalCols = nonTotalIndices.map(i => allCols[i]);
    if (nonTotalCols.length === 0) return [];

    // Group by enum value so multiple value sources per enum value are collapsed
    const enumGroups = new Map<string, { label: string; indices: number[] }>();
    for (let fi = 0; fi < nonTotalCols.length; fi++) {
      const c = nonTotalCols[fi];
      const ev = c.value!;
      if (!enumGroups.has(ev)) {
        enumGroups.set(ev, { label: xdKey ? this.translateEnumValue(c.sourceKey, ev) : ev, indices: [] });
      }
      enumGroups.get(ev)!.indices.push(nonTotalIndices[fi]);
    }

    const groupEntries = Array.from(enumGroups.values());
    if (groupEntries.length === 0) return [];

    const dataRows = rows.filter(r => r.label !== 'Total');
    const grandTotal = dataRows.reduce((sum, r) => {
      return sum + groupEntries.reduce((s, g) => {
        return s + g.indices.reduce((si, ci) => {
          const c = r.cells[ci];
          return si + (typeof c?.raw === 'number' ? c.raw : (typeof c?.v === 'number' ? c.v : 0));
        }, 0);
      }, 0);
    }, 0);
    if (grandTotal === 0) return [];

    const palette = this.colorPalette();

    return dataRows.map((row) => {
      const groupValues = groupEntries.map(g => {
        return g.indices.reduce((s, ci) => {
          const c = row.cells[ci];
          return s + (typeof c?.raw === 'number' ? c.raw : (typeof c?.v === 'number' ? c.v : 0));
        }, 0);
      });
      const rowTotal = groupValues.reduce((s, v) => s + v, 0);

      return {
        label: row.label,
        rowHeight: (rowTotal / grandTotal) * 100,
        cells: groupEntries.map((g, gi) => {
          const val = groupValues[gi];
          const rowPct = rowTotal > 0 ? (val / rowTotal) * 100 : 0;
          return {
            columnLabel: g.label,
            displayValue: String(val),
            width: rowPct,
            value: val,
            color: palette.colColorMap.get(g.label) ?? 'hsl(0, 55%, 50%)',
          };
        }),
      };
    });
  });

  private getRowPct(row: { cells: { width: number }[] }): string {
    return row.cells.map(c => c.width.toFixed(1) + '%').join(' ');
  }

  readonly radiantData = computed(() => {
    const rows = this.reportData();
    if (rows.length === 0) return null;

    const allCols = this.effectiveColumns();
    const xdKey = this.xDimension();
    const hasXD = !!xdKey;

    // Inner circle uses total columns (or all columns when no X-dim)
    const totalIndices = allCols
      .map((c, i) => !c.value ? i : -1)
      .filter(i => i >= 0);
    const hasNumericTotal = totalIndices.some(i => allCols[i].kind === 'number');
    const innerIndices = hasXD
      ? (hasNumericTotal
        ? totalIndices.filter(i => allCols[i].kind === 'number')
        : totalIndices)
      : allCols.map((_, i) => i);

    const dataRows = rows.filter(r => r.label !== 'Total');
    const grandTotal = dataRows.reduce((sum, r) => {
      return sum + innerIndices.reduce((s, ci) => {
        const c = r.cells[ci];
        return s + (typeof c?.raw === 'number' ? c.raw : (typeof c?.v === 'number' ? c.v : 0));
      }, 0);
    }, 0);
    if (grandTotal === 0) return null;

    // Outer ring: group by enum value when X-dim is selected
    const nonTotalIndices = allCols
      .map((c, i) => c.value ? i : -1)
      .filter(i => i >= 0);
    const nonTotalCols = nonTotalIndices.map(i => allCols[i]);

    const enumGroups = new Map<string, { label: string; indices: number[] }>();
    if (hasXD) {
      for (let fi = 0; fi < nonTotalCols.length; fi++) {
        const c = nonTotalCols[fi];
        const ev = c.value!;
        if (!enumGroups.has(ev)) {
          enumGroups.set(ev, { label: this.translateEnumValue(c.sourceKey, ev), indices: [] });
        }
        enumGroups.get(ev)!.indices.push(nonTotalIndices[fi]);
      }
    }

    const groupEntries = Array.from(enumGroups.values());

    const palette = this.colorPalette();

    const arcBBox = (cx: number, cy: number, r1: number, r2: number, start: number, end: number, includeCenter: boolean) => {
      const sweep = end - start;
      const pts: [number, number][] = includeCenter ? [[cx, cy]] : [];
      pts.push(
        [cx + r1 * Math.cos(start), cy + r1 * Math.sin(start)],
        [cx + r1 * Math.cos(end), cy + r1 * Math.sin(end)],
        [cx + r2 * Math.cos(start), cy + r2 * Math.sin(start)],
        [cx + r2 * Math.cos(end), cy + r2 * Math.sin(end)],
      );
      for (const r of [r1, r2]) {
        for (const a of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
          let d = ((a - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          if (d <= sweep + 0.0001) pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
        }
      }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [px, py] of pts) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    };

    let angle = -Math.PI / 2;
    const numKey = allCols.find(c => c.kind === 'number')?.key;
    const innerSlices = dataRows.map((row, ri) => {
      const rowTotal = innerIndices.reduce((s, ci) => {
        const c = row.cells[ci];
        return s + (typeof c?.raw === 'number' ? c.raw : (typeof c?.v === 'number' ? c.v : 0));
      }, 0);
      const sweep = (rowTotal / grandTotal) * Math.PI * 2;
      const start = angle;
      const end = angle + sweep;
      angle = end;
      const bb = arcBBox(0, 0, 0, 50, start, end, true);
      return {
        label: row.label,
        value: rowTotal,
        displayValue: numKey ? this.formatNumber(rowTotal, numKey) : String(rowTotal),
        startAngle: start,
        endAngle: end,
        sweep,
        color: palette.rowColorMap.get(row.label) ?? 'hsl(0, 55%, 50%)',
        labelX: bb.x,
        labelY: bb.y,
      };
    });

    const outerRings = hasXD && groupEntries.length > 0 ? dataRows.map((row, ri) => {
      let innerAngle = innerSlices[ri].startAngle;
      return groupEntries.map((g, gi) => {
        const val = g.indices.reduce((s, ci) => {
          const c = row.cells[ci];
          return s + (typeof c?.raw === 'number' ? c.raw : (typeof c?.v === 'number' ? c.v : 0));
        }, 0);
        const rowTotal = innerSlices[ri].value;
        const sweep = rowTotal > 0 ? (val / rowTotal) * (innerSlices[ri].endAngle - innerSlices[ri].startAngle) : 0;
        const start = innerAngle;
        const end = innerAngle + sweep;
        innerAngle = end;
        const bb = arcBBox(0, 0, 50, 95, start, end, false);
        return {
          columnLabel: g.label,
          displayValue: String(val),
          rowLabel: row.label,
          rowSweep: innerSlices[ri].sweep,
          startAngle: start,
          endAngle: end,
          sweep,
          color: palette.colColorMap.get(g.label) ?? 'hsl(0, 55%, 50%)',
          labelX: bb.x,
          labelY: bb.y,
        };
      }).filter(s => s.endAngle - s.startAngle > 0.001);
    }) : [];

    return { innerSlices, outerRings };
  });

  /** ECharts sunburst options derived from radiantData (same data preparation). */
  readonly sunburstOptions = computed(() => {
    const data = this.radiantData();
    if (!data) return null;

    const hasOuter = data.outerRings.length > 0 && data.outerRings.some(r => r.length > 0);

    const sunburstData = data.innerSlices.map((slice, i) => {
      const children = hasOuter ? (data.outerRings[i] ?? []).map(arc => ({
        name: arc.columnLabel,
        value: arc.sweep,
        itemStyle: { color: arc.color },
        label: { show: true, formatter: `${arc.columnLabel}\n{value|${arc.displayValue}}`, rich: { value: { fontSize: 10, color: '#333' } } },
      })) : undefined;

      return {
        name: slice.label,
        value: slice.sweep,
        itemStyle: { color: slice.color },
        label: { show: true, formatter: `${slice.label}\n{value|${slice.displayValue}}`, rich: { value: { fontSize: 10, color: '#333' } } },
        ...(children && children.length > 0 ? { children } : {}),
      };
    });

    return {
      tooltip: {
        trigger: 'item' as const,
        formatter: (params: any) => {
          const d = params.data;
          return d ? `${d.name}<br/>${d.label?.formatter ?? ''}` : '';
        },
      },
      series: [{
        type: 'sunburst' as const,
        data: sunburstData,
        radius: ['15%', '90%'],
        sort: undefined,
        emphasis: { focus: 'ancestor' as const },
        levels: [
          {},
          { r0: '15%', r: '55%', label: { rotate: 'tangential' as const } },
          { r0: '55%', r: '90%', label: { align: 'right' as const } },
        ],
      }],
    };
  });

  describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
    const sweep = endAngle - startAngle;
    if (sweep >= Math.PI * 2 - 0.001) {
      return `M ${cx - r},${cy} A ${r},${r} 0 1,1 ${cx + r},${cy} A ${r},${r} 0 1,1 ${cx - r},${cy} Z`;
    }
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = sweep > Math.PI ? 1 : 0;
    return `M ${cx},${cy} L ${x1},${y1} A ${r},${r} 0 ${largeArc},1 ${x2},${y2} Z`;
  }

  describeAnnulusArc(cx: number, cy: number, r1: number, r2: number, startAngle: number, endAngle: number): string {
    const sweep = endAngle - startAngle;
    if (sweep >= Math.PI * 2 - 0.001) {
      return `M ${cx - r2},${cy} A ${r2},${r2} 0 1,1 ${cx + r2},${cy} A ${r2},${r2} 0 1,1 ${cx - r2},${cy} Z` +
             `M ${cx - r1},${cy} A ${r1},${r1} 0 1,0 ${cx + r1},${cy} A ${r1},${r1} 0 1,0 ${cx - r1},${cy} Z`;
    }
    const ox1 = cx + r2 * Math.cos(startAngle);
    const oy1 = cy + r2 * Math.sin(startAngle);
    const ox2 = cx + r2 * Math.cos(endAngle);
    const oy2 = cy + r2 * Math.sin(endAngle);
    const ix1 = cx + r1 * Math.cos(endAngle);
    const iy1 = cy + r1 * Math.sin(endAngle);
    const ix2 = cx + r1 * Math.cos(startAngle);
    const iy2 = cy + r1 * Math.sin(startAngle);
    const largeArc = sweep > Math.PI ? 1 : 0;
    return `M ${ox1},${oy1} A ${r2},${r2} 0 ${largeArc},1 ${ox2},${oy2} L ${ix1},${iy1} A ${r1},${r1} 0 ${largeArc},0 ${ix2},${iy2} Z`;
  }

  /** Top header row: Column Dimension (X-Axis) label spanning all data columns. */
  readonly headerRow1 = computed<HeaderCell1[]>(() => {
    const xdKey = this.xDimension();
    const numCols = this.effectiveColumns().length;
    if (numCols === 0) return [];
    const row: HeaderCell1[] = [];
    if (xdKey) {
      const opt = this.xDimensionOptions().find(o => o.key === xdKey);
      row.push({ label: opt?.label ?? xdKey, colspan: numCols });
    } else {
      row.push({ label: 'Total', colspan: numCols });
    }
    return row;
  });

  /** Middle header row: enum value group headers (EDC, ADC, …, Total). */
  readonly headerRow2 = computed<HeaderCell2[]>(() => {
    const sources = this.xSources();
    const enumSources = sources.filter(s => s.kind === 'enum');
    const valueSources = sources.filter(s => s.kind !== 'enum');
    const row: HeaderCell2[] = [];

    if (enumSources.length > 0 && valueSources.length > 0) {
      for (const enumSrc of enumSources) {
        for (const v of this.getXEnumValues(enumSrc.key)) {
          row.push({ label: this.translateEnumValue(enumSrc.key, v), colspan: valueSources.length, sourceKey: enumSrc.key, removable: true, groupValue: v });
        }
        row.push({ label: 'Total', colspan: valueSources.length, sourceKey: 'total', removable: false });
      }
    }
    return row;
  });

  /** Bottom header row: value source sub-headers (1:1 with effectiveColumns). */
  readonly headerRow3 = computed<HeaderCell3[]>(() => {
    const cols = this.effectiveColumns();
    const hasEnum = cols.some(c => !!c.value);
    return cols.map(c => ({
      label: c.kind === 'count' ? 'Count' : (c.value ? this.getNumericLabel(c.numericKey || c.key) : (hasEnum ? `Total - ${this.getNumericLabel(c.numericKey || c.key)}` : this.getNumericLabel(c.numericKey || c.key))),
      colKey: c.key,
    }));
  });

  readonly filteredEntities = signal<ApplicationItem[]>([]);
  private currentFilters = signal<EntityListFilters>(emptyEntityListFilters());
  readonly reportData = signal<{ label: string; cells: { v: number | string; raw?: number; title?: string }[] }[]>([]);

  /** Per value-class max across non-total rows × non-total columns (excluding total rows and total columns). */
  private readonly classMaxValues = computed(() => {
    const data = this.reportData();
    const cols = this.effectiveColumns();
    if (data.length === 0 || cols.length === 0) return new Map<string, number>();

    const maxes = new Map<string, number>();
    for (let ci = 0; ci < cols.length; ci++) {
      const col = cols[ci];
      const aggKey = col.numericKey || col.key;
      for (const row of data) {
        if (row.label === 'Total') continue;
        const c = row.cells[ci];
        const raw = typeof c?.raw === 'number' ? c.raw : (typeof c?.v === 'number' ? c.v : 0);
        if (raw > (maxes.get(aggKey) ?? 0)) maxes.set(aggKey, raw);
      }
    }
    return maxes;
  });

  /** Shared color palette. Each map independently spans the full 360° hue range.
   *  Exception: when both row and column labels exist (Radiant), they share one palette to stay distinct. */
  readonly colorPalette = computed(() => {
    const data = this.reportData();
    const rows = data.filter(r => r.label !== 'Total');
    const allCols = this.effectiveColumns();
    const xdKey = this.xDimension();

    const rowLabels = rows.map(r => r.label);

    const colLabels: string[] = [];
    if (xdKey) {
      const seen = new Set<string>();
      for (const c of allCols) {
        if (c.value && !seen.has(c.value)) {
          seen.add(c.value);
          colLabels.push(this.translateEnumValue(c.sourceKey, c.value));
        }
      }
    }

    const classKeys = [...new Set(allCols.map(c => c.numericKey || c.key))];

    const hsl = (i: number, n: number) => `hsl(${n > 1 ? (360 / n) * i : 0}, 55%, 50%)`;

    const hasBoth = rowLabels.length > 0 && colLabels.length > 0;
    let rowColorMap: Map<string, string>;
    let colColorMap: Map<string, string>;

    if (hasBoth) {
      // Radiant: rows + columns share one palette so colors stay distinct
      const all = [...rowLabels, ...colLabels];
      const combined = new Map(all.map((l, i) => [l, hsl(i, all.length)]));
      rowColorMap = new Map(rowLabels.map(l => [l, combined.get(l)!]));
      colColorMap = new Map(colLabels.map(l => [l, combined.get(l)!]));
    } else {
      // Marimekko, table, histogram: each map spans full 360°
      rowColorMap = new Map(rowLabels.map((l, i) => [l, hsl(i, rowLabels.length)]));
      colColorMap = new Map(colLabels.map((l, i) => [l, hsl(i, colLabels.length)]));
    }

    const classColorMap = new Map(classKeys.map((k, i) => [k, hsl(i, classKeys.length)]));
    return { rowColorMap, colColorMap, classColorMap };
  });

  /** Color for each column's bubble, keyed by value class. */
  readonly bubbleColors = computed(() => {
    const cols = this.effectiveColumns();
    const palette = this.colorPalette();
    return cols.map(c => palette.classColorMap.get(c.numericKey || c.key) ?? 'hsl(0, 55%, 50%)');
  });
  readonly loading = signal(true);
  initialFilters = signal<Partial<EntityListFilters>>({});

  readonly allXOptions = signal<XSource[]>([]);
  readonly xOptionsAvailable = computed(() => {
    const current = new Set(this.xSources().map(c => c.key));
    return this.allXOptions().filter(o => !current.has(o.key));
  });

  readonly selectedXKeys = computed(() => this.xSources().map(s => s.key));

  readonly xDimensionOptions = computed(() => {
    const opts: XSource[] = [{ key: '', label: '---', kind: 'enum' }];
    for (const attr of BUILT_IN_ATTRS) {
      opts.push({ key: attr.id, label: attr.label, kind: 'enum' });
    }
    const cf = this.customFields();
    for (const [key, def] of Object.entries(cf)) {
      const label = def.label?.['en'] ?? def.label?.[Object.keys(def.label)[0]] ?? key;
      if (def.type === 'selectSingle' || def.type === 'selectMultiple' || def.type === 'string' || def.type === 'textarea') {
        opts.push({ key, label, kind: 'enum' });
      }
    }
    const groups = this.tagGroups();
    for (const group of groups) {
      const label = group.displayName ?? group.name ?? group.id ?? '';
      if (!label) continue;
      const groupId = group.id ?? group.name ?? '';
      opts.push({ key: `tag:${groupId}`, label: `Tag: ${label}`, kind: 'enum' });
    }
    return opts;
  });

  readonly valueOptions = computed(() => {
    const opts: ValueSource[] = [{ key: 'count', label: 'Count', kind: 'count' }];
    const cf = this.customFields();
    for (const [key, def] of Object.entries(cf)) {
      const label = def.label?.['en'] ?? def.label?.[Object.keys(def.label)[0]] ?? key;
      if (def.type === 'number' || def.type === 'virtual') {
        opts.push({ key, label, kind: 'number' });
      }
    }
    return opts;
  });

  readonly selectedValueKeys = computed(() => this.values().map(v => v.key));
  readonly selectedValueKey = computed(() => this.values()[0]?.key ?? 'count');

  readonly hasXDimension = computed(() => !!this.xDimension());
  readonly isSingleValueMode = computed(() => {
    const style = this.displayStyle();
    const xdKey = this.xDimension();
    return style === 'radiant' || style === 'sunburst' || (style === 'marimekko' && !!xdKey);
  });

  readonly nonTotalColumns = computed<ReportColumn[]>(() => {
    const xdKey = this.xDimension();
    if (!xdKey) return this.effectiveColumns();
    return this.effectiveColumns().filter(c => !!c.value);
  });

  readonly marimekkoLegend = computed(() => {
    const data = this.marimekkoData();
    const entries: { label: string; color: string }[] = [];
    const seen = new Set<string>();
    for (const row of data) {
      for (const cell of row.cells) {
        if (cell.width > 0 && !seen.has(cell.columnLabel)) {
          seen.add(cell.columnLabel);
          entries.push({ label: cell.columnLabel, color: cell.color });
        }
      }
    }
    return entries;
  });

  readonly radiantLegend = computed(() => {
    const data = this.radiantData();
    if (!data || data.outerRings.length === 0) return [];
    const seen = new Set<string>();
    const entries: { label: string; color: string }[] = [];
    for (const ring of data.outerRings) {
      for (const arc of ring) {
        if (!seen.has(arc.columnLabel)) {
          seen.add(arc.columnLabel);
          entries.push({ label: arc.columnLabel, color: arc.color });
        }
      }
    }
    return entries;
  });

  readonly histogramData = computed<HistogramColumnData[]>(() => {
    const entities = this.filteredEntities();
    const vals = this.values();
    const yKey = this.yDimension();
    const numBuckets = this.numBuckets();

    const numSources = vals.filter(s => s.kind === 'number');
    const useCount = numSources.length === 0;
    if (entities.length === 0) return [];

    const sources = useCount ? [{ key: 'count', label: 'Count', kind: 'count' as const }] : numSources;
    const histograms: HistogramColumnData[] = [];

    for (const source of sources) {
      const entityValues = new Map<ApplicationItem, number>();
      if (useCount) {
        for (const entity of entities) {
          entityValues.set(entity, 1);
        }
      } else {
        for (const entity of entities) {
          const val = this.getNumericValue(entity, source.key);
          if (val != null && !isNaN(val)) {
            entityValues.set(entity, val);
          }
        }
      }
      if (entityValues.size === 0) continue;

      const values = [...entityValues.values()];
      const min = useCount ? 0 : Math.min(...values);
      const max = useCount ? 1 : Math.max(...values);

      const yValues = yKey ? this.collectYValues(yKey, entities) : [''];
      const palette = this.colorPalette();
      const yColors = new Map<string, string>();
      yValues.forEach((yVal) => {
        const label = yKey ? this.translateEnumValue(yKey, yVal) : yVal;
        yColors.set(yVal, palette.rowColorMap.get(label) ?? 'hsl(0, 55%, 50%)');
      });

      const effectiveBuckets = useCount ? 1 : numBuckets;

      // Compute "nice" bucket boundaries (multiples of 1/2/5 × 10^k)
      let niceMin: number, niceMax: number, niceStep: number;
      if (useCount) {
        niceMin = 0; niceMax = 1; niceStep = 1;
      } else if (min === max) {
        niceMin = min; niceMax = min + 1; niceStep = 1;
      } else {
        const rawStep = (max - min) / effectiveBuckets;
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const normalized = rawStep / magnitude;
        const niceMultipliers = [1, 1.5, 2, 2.5, 5, 10];
        let mult = niceMultipliers[niceMultipliers.length - 1];
        for (const m of niceMultipliers) {
          if (m >= normalized) { mult = m; break; }
        }
        niceStep = mult * magnitude;
        niceMin = Math.floor(min / niceStep) * niceStep;
        niceMax = Math.ceil(max / niceStep) * niceStep;
        if (niceMax === niceMin) niceMax = niceMin + niceStep;
      }
      const actualBuckets = Math.round((niceMax - niceMin) / niceStep);

      const buckets: HistogramBucket[] = [];
      for (let i = 0; i < actualBuckets; i++) {
        const bucketMin = niceMin + i * niceStep;
        const bucketMax = i === actualBuckets - 1 ? niceMax : bucketMin + niceStep;
        const inBucket = (v: number) => i === actualBuckets - 1
          ? v >= bucketMin && v <= bucketMax
          : v >= bucketMin && v < bucketMax;

        const stacks: HistogramStack[] = [];
        let total = 0;
        let cumulativeCount = 0;
        let cumulativeValue = 0;
        for (const yVal of yValues) {
          const matchingEntities = yKey
            ? this.filterByYValue(yKey, yVal, entities)
            : [...entityValues.keys()];
          const bucketEntities = matchingEntities.filter(e => {
            const v = entityValues.get(e);
            return v != null && inBucket(v);
          });
          const count = bucketEntities.length;
          if (count > 0) {
            const sum = bucketEntities.reduce((s, e) => s + (entityValues.get(e) ?? 0), 0);
            cumulativeCount += count;
            cumulativeValue += sum;
            const apps = bucketEntities.slice(0, 5).map(e => ({
              name: e.displayName ?? '',
              value: useCount ? String(count) : this.formatNumber(entityValues.get(e)!, source.key),
            }));
            const truncated = bucketEntities.length > 5;
            stacks.push({
              yValue: yVal || '—',
              count,
              valueSum: sum,
              cumulativeCount,
              cumulativeValue,
              color: yColors.get(yVal) || '#999',
              apps: truncated ? [...apps, { name: '…', value: `${bucketEntities.length - 5} more` }] : apps,
            });
          }
          total += count;
        }
        buckets.push({ min: bucketMin, max: bucketMax, stacks, total });
      }
      histograms.push({ columnKey: source.key, columnLabel: useCount ? 'Count' : source.label, min, max, buckets, yValues });
    }
    return histograms;
  });

  readonly histogramLegend = computed(() => {
    const data = this.histogramData();
    if (data.length === 0) return [];
    const yKey = this.yDimension();
    const yValues = yKey ? this.collectYValues(yKey, this.filteredEntities()) : [''];
    const palette = this.colorPalette();
    return yValues.filter(v => v !== '').map((yVal) => ({
      label: yVal || '—',
      color: palette.rowColorMap.get(yKey ? this.translateEnumValue(yKey, yVal) : yVal) ?? 'hsl(0, 55%, 50%)',
    }));
  });

  /** ECharts options for each histogram column. */
  readonly histogramEchartOptions = computed(() => {
    const data = this.histogramData();
    if (data.length === 0) return [];
    const bySum = this.barHeightMode() === 'Sum';

    return data.map((col, ci) => {
      const uom = this.getUom(col.columnKey) ?? '';
      const xLabels = col.buckets.map(b => {
        const lo = formatCustomNumber(b.min, this.customFields()[col.columnKey]?.format);
        const hi = formatCustomNumber(b.max, this.customFields()[col.columnKey]?.format);
        return uom ? `${lo}-${hi} ${uom}` : `${lo}-${hi}`;
      });

      // Build one series per Y-value (stacked)
      const yValues = col.yValues.filter(v => v !== '');
      const series = yValues.map(yVal => {
        const data = col.buckets.map(b => {
          const stack = b.stacks.find(s => s.yValue === yVal);
          if (!stack) return 0;
          return bySum ? stack.valueSum : stack.count;
        });
        const color = col.buckets[0]?.stacks.find(s => s.yValue === yVal)?.color ?? '#999';
        return {
          name: yVal || '—',
          type: 'bar' as const,
          stack: 'total',
          data,
          itemStyle: { color },
          emphasis: { focus: 'series' as const },
        };
      });

      return {
        tooltip: {
          trigger: 'axis' as const,
          axisPointer: { type: 'shadow' as const },
          formatter: (params: any[]) => {
            if (!params.length) return '';
            let tip = params[0].axisValue + '<br/>';
            let total = 0;
            for (const p of params) {
              if (p.value) {
                tip += `${p.marker} ${p.seriesName}: ${p.value}<br/>`;
                total += p.value;
              }
            }
            tip += `<b>Total: ${total}</b>`;
            return tip;
          },
        },
        legend: { show: false },
        grid: { left: 60, right: 20, top: 10, bottom: 40, containLabel: false },
        xAxis: {
          type: 'category' as const,
          data: xLabels,
          axisLabel: { rotate: col.buckets.length > 10 ? 45 : 0, fontSize: 10 },
        },
        yAxis: {
          type: 'value' as const,
          name: bySum ? 'Sum' : 'Count',
        },
        series,
      };
    });
  });

  private getNumericValue(entity: ApplicationItem, key: string): number | undefined {
    const v = (entity as Record<string, unknown>)[key];
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const n = parseFloat(v);
      return isNaN(n) ? undefined : n;
    }
    return undefined;
  }

  private customFields = signal<Record<string, CustomFieldDefinition>>({});
  private tagGroups = signal<TagGroupItem[]>([]);

  private readonly QP = {
    name: 'name', status: 'status', techSuit: 'techSuit', bizSuit: 'bizSuit',
    timeClass: 'timeClass', bizCrit: 'bizCrit', bizCap: 'bizCap', bizCapMode: 'bizCapMode',
    userGroup: 'userGroup', userGroupMode: 'userGroupMode', project: 'project',
    dataProduct: 'dataProduct', tags: 'tags', tagGroups: 'tagGroups',
    customFields: 'cf', customFieldIds: 'cfIds', northStar: 'northStar',
    pills: 'pills',
  } as const;

  constructor() {
    effect(() => {
      this.yDimension();
      this.xSources();
      this.aggMode();
      this.filteredEntities();
      this.expandedColumns();
      this.computeReport();
    });

    effect(() => {
      const groups = this.tagsService.data();
      this.tagGroups.set(groups);
      this.buildAllOptions();
    });

    const appsEffect = effect(() => {
      const apps = this.applicationsService.applications();
      const isLoading = this.applicationsService.loading();
      if (isLoading) {
        this._seenAppLoading = true;
        return;
      }
      if (this._seenAppLoading || apps.length > 0) {
        setTimeout(() => {
          this.loading.set(false);
          this.applyFiltersToData();
        });
      }
    });
  }

  ngOnInit(): void {
    this.pageTitleService.setTitle('Reports');
    this.applicationsService.ensureLoaded();

    this.modelDefinitionsService.getModelDefinitions().subscribe({
      next: (defs) => {
        const appDef = defs['Application'];
        if (appDef?.customFields) this.customFields.set(appDef.customFields);
        this.buildAllOptions();
      },
      error: () => this.buildAllOptions(),
    });

    this.tagsService.load();

    const qp = this.route.snapshot.queryParams;
    const partial: Partial<EntityListFilters> = {};
    const name = (qp[this.QP.name] ?? '').trim();
    if (name) partial.name = name;
    const status = (qp[this.QP.status] ?? '').trim().toUpperCase();
    if (status && (status === 'ACTIVE' || status === 'ARCHIVED')) partial.status = status;
    const tech = (qp[this.QP.techSuit] ?? '').trim();
    if (tech && (SUITABILITY_VALUES.includes(tech as any) || tech === SUITABILITY_FILTER_EMPTY)) partial.technicalSuitability = tech;
    const biz = (qp[this.QP.bizSuit] ?? '').trim();
    if (biz && (SUITABILITY_VALUES.includes(biz as any) || biz === SUITABILITY_FILTER_EMPTY)) partial.functionalSuitability = biz;
    const timeClass = (qp[this.QP.timeClass] ?? '').trim();
    if (timeClass && (TIME_CLASSIFICATION_VALUES.includes(timeClass as any) || timeClass === SUITABILITY_FILTER_EMPTY)) partial.lxTimeClassification = timeClass;
    const northStar = (qp[this.QP.northStar] ?? '').trim();
    if (northStar && (NORTH_STAR_CLASSIFICATION_VALUES.includes(northStar as any) || northStar === SUITABILITY_FILTER_EMPTY)) partial.northStarClassification = northStar;
    const bizCrit = (qp[this.QP.bizCrit] ?? '').trim();
    if (bizCrit && (CRITICALITY_VALUES.includes(bizCrit as any) || bizCrit === SUITABILITY_FILTER_EMPTY)) partial.businessCriticality = bizCrit;
    const bizCap = (qp[this.QP.bizCap] ?? '').trim();
    if (bizCap) partial.relApplicationToBusinessCapability = bizCap;
    const bizCapMode = (qp[this.QP.bizCapMode] ?? '').trim();
    if (bizCapMode === 'exact') partial.relApplicationToBusinessCapabilityMode = 'exact';
    const userGroup = (qp[this.QP.userGroup] ?? '').trim();
    if (userGroup) partial.relApplicationToUserGroup = userGroup;
    const userGroupMode = (qp[this.QP.userGroupMode] ?? '').trim();
    if (userGroupMode === 'exact') partial.relApplicationToUserGroupMode = 'exact';
    const project = (qp[this.QP.project] ?? '').trim();
    if (project) partial.relApplicationToProject = project;
    const dataProduct = (qp[this.QP.dataProduct] ?? '').trim();
    if (dataProduct) partial.relApplicationToDataProduct = dataProduct;
    const tagsRaw = (qp[this.QP.tags] ?? '').trim();
    if (tagsRaw) partial.tags = tagsRaw.split(',').filter(Boolean);
    const tagGroupsRaw = (qp[this.QP.tagGroups] ?? '').trim();
    if (tagGroupsRaw) partial.tagGroups = tagGroupsRaw.split(',').filter(Boolean);
    const cfRaw = (qp[this.QP.customFields] ?? '').trim();
    if (cfRaw) {
      try {
        const parsed = JSON.parse(cfRaw);
        if (typeof parsed === 'object' && parsed != null) partial.customFields = parsed as Record<string, string>;
      } catch { /* ignore */ }
    }
    const cfIdsRaw = (qp[this.QP.customFieldIds] ?? '').trim();
    if (cfIdsRaw) partial.customFieldIds = cfIdsRaw.split(',').filter(Boolean);
    const pillsRaw = (qp[this.QP.pills] ?? '').trim();
    if (pillsRaw) partial.visiblePills = parseVisiblePills(pillsRaw.split(',').filter(Boolean));
    this.initialFilters.set(partial);
    this.currentFilters.set({ ...emptyEntityListFilters(), ...partial });

    const reportRaw = decodeURIComponent((qp[REPORT_QP] ?? '').trim());
    if (reportRaw) {
      try {
        const cfg = JSON.parse(reportRaw) as ReportConfig;
        if (cfg.y) this.yDimension.set(cfg.y);
        if (Array.isArray(cfg.x) && cfg.x.length > 0) this._pendingXKeys = cfg.x;
        if (cfg.agg && ['Sum', 'Average', 'Max', 'Min'].includes(cfg.agg)) this.aggMode.set(cfg.agg);
        if (cfg.style === 'table' || cfg.style === 'marimekko' || cfg.style === 'radiant' || cfg.style === 'histogram' || cfg.style === 'sunburst') this.displayStyle.set(cfg.style);
        if (cfg.buckets && [5, 10, 25, 50, 100].includes(cfg.buckets)) this.numBuckets.set(cfg.buckets);
        if (cfg.barHeight === 'Sum' || cfg.barHeight === 'Count') this.barHeightMode.set(cfg.barHeight);
      } catch { /* ignore */ }
    }
  }

  ngOnDestroy(): void {
    this.pageTitleService.clearTitle();
  }

  private _pendingXKeys: string[] | null = null;
  private _seenAppLoading = false;

  private buildAllOptions(): void {
    const yOpts: { id: string; label: string }[] = [];
    const xOpts: XSource[] = [
      { key: 'count', label: 'Count', kind: 'count' },
    ];

    for (const attr of BUILT_IN_ATTRS) {
      yOpts.push({ id: attr.id, label: attr.label });
      xOpts.push({ key: attr.id, label: attr.label, kind: 'enum' });
    }

    const cf = this.customFields();
    for (const [key, def] of Object.entries(cf)) {
      const label = def.label?.['en'] ?? def.label?.[Object.keys(def.label)[0]] ?? key;
      if (def.type === 'selectSingle' || def.type === 'selectMultiple') {
        yOpts.push({ id: key, label });
        xOpts.push({ key, label, kind: 'enum' });
      } else if (def.type === 'number' || def.type === 'virtual') {
        xOpts.push({ key, label, kind: 'number' });
      }
    }

    const groups = this.tagGroups();
    for (const group of groups) {
      const label = group.displayName ?? group.name ?? group.id ?? '';
      if (!label) continue;
      const groupId = group.id ?? group.name ?? '';
      yOpts.push({ id: `tag:${groupId}`, label: `Tag: ${label}` });
      xOpts.push({ key: `tag:${groupId}`, label: `Tag: ${label}`, kind: 'enum' });
    }

    this.yOptions.set(yOpts);
    this.allXOptions.set(xOpts);

    if (this._pendingXKeys) {
      const keys = this._pendingXKeys;
      const xdOpts = this.xDimensionOptions();
      const valOpts = this.valueOptions();
      let allResolved = true;

      const xdKey = keys.find(k => xdOpts.some(o => o.key === k));
      const valKeys = keys.filter(k => k !== xdKey);

      if (xdKey) {
        const opt = xdOpts.find(o => o.key === xdKey);
        if (opt) {
          this.xDimension.set(xdKey);
        } else {
          allResolved = false;
        }
      }

      const resolvedValues: ValueSource[] = [];
      for (const k of valKeys) {
        if (k === 'count') {
          resolvedValues.push({ key: 'count', label: 'Count', kind: 'count' });
        } else {
          const opt = valOpts.find(o => o.key === k);
          if (opt) {
            resolvedValues.push({ ...opt });
          } else {
            allResolved = false;
          }
        }
      }

      if (allResolved) {
        this._pendingXKeys = null;
        if (resolvedValues.length > 0) this.values.set(resolvedValues);
        this.syncXSources();
      }
    }
  }

  onFiltersChange(filters: EntityListFilters): void {
    this.currentFilters.set(filters);
    this.updateUrlQueryParams(filters);
    this.applyFiltersToData();
  }

  private applyFiltersToData(): void {
    const filters = this.currentFilters();
    const apps = this.applicationsService.applications();
    if (apps.length === 0) return;
    const result = this.applicationsService.applyFilters({
      name: filters.name,
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
      tags: filters.tags,
      customFields: filters.customFields,
    });
    this.filteredEntities.set(result);
    this.cdr.markForCheck();
  }

  onYDimensionChange(value: string): void {
    this.yDimension.set(value);
    this.pushReportToUrl();
  }

  onXDimensionChange(key: string): void {
    this.xDimension.set(key);
    this.syncXSources();
    this.enforceSingleValue();
    this.pushReportToUrl();
  }

  onValuesChange(keys: string[]): void {
    if (keys.length === 0) {
      keys = ['count'];
    }
    const all = this.valueOptions();
    const newValues = keys.map(k => all.find(o => o.key === k)).filter(Boolean) as ValueSource[];
    this.values.set(newValues.length > 0 ? newValues : [{ key: 'count', label: 'Count', kind: 'count' }]);
    this.syncXSources();
    this.pushReportToUrl();
  }

  onSingleValueChange(key: string): void {
    const all = this.valueOptions();
    const found = all.find(o => o.key === key);
    this.values.set(found ? [{ ...found }] : [{ key: 'count', label: 'Count', kind: 'count' }]);
    this.syncXSources();
    this.pushReportToUrl();
  }

  private enforceSingleValue(): void {
    if (!this.isSingleValueMode()) return;
    const vals = this.values();
    if (vals.length > 1) {
      this.values.set([vals[0]]);
      this.syncXSources();
    }
  }

  private syncXSources(): void {
    const sources: XSource[] = [];
    const xdKey = this.xDimension();
    if (xdKey) {
      const opt = this.xDimensionOptions().find(o => o.key === xdKey);
      if (opt) sources.push({ key: xdKey, label: opt.label, kind: 'enum' });
    }
    for (const v of this.values()) {
      if (v.key === 'count') {
        sources.push({ key: 'count', label: 'Count', kind: 'count' });
      } else {
        sources.push({ key: v.key, label: v.label, kind: 'number' });
      }
    }
    if (sources.length === 0) {
      sources.push({ key: 'count', label: 'Count', kind: 'count' });
    }
    this.xSources.set(sources);
  }

  addXColumn(key: string): void {
    const allOpts = this.allXOptions();
    const opt = allOpts.find(o => o.key === key);
    if (!opt || this.xSources().some(s => s.key === key)) return;
    this.xSources.set([...this.xSources(), { ...opt }]);
    this.pushReportToUrl();
  }

  onXColumnsChange(keys: string[]): void {
    if (keys.length === 0) {
      keys = ['count'];
    }
    const all = this.allXOptions();
    const newSources = keys.map(k => all.find(o => o.key === k)).filter(Boolean) as XSource[];
    this.xSources.set(newSources);
    this.pushReportToUrl();
  }

  removeXColumn(colKey: string): void {
    const current = this.xSources();
    if (colKey === 'count') {
      if (current.length <= 1) return;
      this.xSources.set(current.filter(s => s.key !== 'count'));
    } else if (colKey.includes('::')) {
      const sourceKey = colKey.split('::')[0];
      const value = colKey.split('::')[1];
      this.removeXEnumValue(sourceKey, value);
      // If all values excluded, remove source entirely
      if (this.getEffectiveEnumValues(sourceKey).length === 0) {
        this._excludedEnumValues.delete(sourceKey);
        this.ensureCountAfterRemoval(current.filter(s => s.key !== sourceKey));
      }
      return;
    } else {
      if (current.length <= 1) return;
      this.ensureCountAfterRemoval(current.filter(s => s.key !== colKey));
    }
    this.pushReportToUrl();
  }

  removeXEnumValue(sourceKey: string, value: string): void {
    const current = this.xSources();
    const src = current.find(s => s.key === sourceKey);
    if (!src || src.kind !== 'enum') return;
    const excluded = this._excludedEnumValues.get(sourceKey) ?? new Set<string>();
    excluded.add(value);
    this._excludedEnumValues.set(sourceKey, excluded);
    this._excludedEnumValues = new Map(this._excludedEnumValues);
    this.pushReportToUrl();
  }

  private _excludedEnumValues = new Map<string, Set<string>>();

  isEnumValueExcluded(sourceKey: string, value: string): boolean {
    return this._excludedEnumValues.get(sourceKey)?.has(value) ?? false;
  }

  /** Get effective enum values minus excluded ones. */
  getEffectiveEnumValues(sourceKey: string): string[] {
    const excluded = this._excludedEnumValues.get(sourceKey);
    if (!excluded || excluded.size === 0) return this.getXEnumValues(sourceKey);
    return this.getXEnumValues(sourceKey).filter(v => !excluded.has(v));
  }

  /** Check if an entire enum source should be removed (all values excluded). */
  private ensureCountAfterRemoval(sources: XSource[]): void {
    if (sources.length === 0) {
      sources = [{ key: 'count', label: 'Count', kind: 'count' }];
    }
    this.xSources.set(sources);
  }

  onAggModeChange(mode: AggMode): void {
    this.aggMode.set(mode);
    this.pushReportToUrl();
  }

  onDisplayStyleChange(style: 'table' | 'marimekko' | 'radiant' | 'histogram' | 'sunburst'): void {
    this.displayStyle.set(style);
    this.enforceSingleValue();
    this.pushReportToUrl();
  }

  onNumBucketsChange(value: number): void {
    this.numBuckets.set(value);
    this.pushReportToUrl();
  }

  onBarHeightChange(mode: BarHeightMode): void {
    this.barHeightMode.set(mode);
    this.pushReportToUrl();
  }

  async onExport(): Promise<void> {
    const rows = this.reportData();
    const cols = this.effectiveColumns();
    if (rows.length === 0 || cols.length === 0) return;
    this.snackBar.open('Download started…', '', { duration: 3000 });

    const [ExcelJSModule, FileSaverModule] = await Promise.all([import('exceljs'), import('file-saver')]);
    const ExcelJSDefault = ExcelJSModule.default;
    const saveAsFn = (FileSaverModule as any)?.saveAs ?? (FileSaverModule as any)?.default ?? FileSaverModule;
    if (typeof saveAsFn !== 'function') {
      console.error('file-saver saveAs export not found', FileSaverModule);
      return;
    }

    const wb = new ExcelJSDefault.Workbook();
    const ws = wb.addWorksheet('Report');

    // Build header rows matching the 3-row table structure
    // Row 1: X-dimension label(s) spanning data columns
    // Row 2: enum value group headers (EDC, ADC, …, Total)
    // Row 3: Y-label in A3 + value source sub-headers
    const hr1Cells = this.headerRow1();
    const hr2Cells = this.headerRow2();
    const hr3Cells = this.headerRow3();
    const hasR1 = hr1Cells.length > 0;
    const hasR2 = hr2Cells.length > 0;
    const hasR3 = hr3Cells.length > 0;
    const yLabel = this.getYLabel(this.yDimension());

    let rowNum = 0;

    // Row 1: X-dimension label(s) with colspans (A1 empty)
    if (hasR1) {
      rowNum++;
      const h1Values: string[] = [''];
      for (const cell of hr1Cells) {
        for (let i = 0; i < cell.colspan; i++) h1Values.push(i === 0 ? cell.label : '');
      }
      const hr1 = ws.addRow(h1Values);
      hr1.eachCell((cell, cn) => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
        cell.border = { bottom: { style: 'thin' as any } };
      });
      let mergeCol = 2;
      for (const hc of hr1Cells) {
        if (hc.colspan > 1) {
          ws.mergeCells(rowNum, mergeCol, rowNum, mergeCol + hc.colspan - 1);
        }
        mergeCol += hc.colspan;
      }
    }

    // Row 2: enum value group headers (EDC, ADC, …, Total) with colspans (A2 empty)
    if (hasR2) {
      rowNum++;
      const h2Values: (string | null)[] = [null]; // A2 empty
      for (const hc of hr2Cells) {
        for (let i = 0; i < hc.colspan; i++) h2Values.push(i === 0 ? hc.label : '');
      }
      const hr2 = ws.addRow(h2Values);
      hr2.eachCell((cell, cn) => {
        if (cell.value != null) {
          cell.font = { bold: true, size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
          cell.alignment = { horizontal: 'center' };
          cell.border = { bottom: { style: 'thin' as any } };
        }
      });
      let mergeCol = 2;
      for (const hc of hr2Cells) {
        if (hc.colspan > 1) {
          ws.mergeCells(rowNum, mergeCol, rowNum, mergeCol + hc.colspan - 1);
        }
        mergeCol += hc.colspan;
      }
    }

    // Row 3: Y-label in A3 + value source sub-headers
    if (hasR3) {
      rowNum++;
      const h3Values: (string | null)[] = [yLabel]; // Y-label in A3
      for (const hc of hr3Cells) {
        h3Values.push(hc.label);
      }
      const hr3 = ws.addRow(h3Values);
      hr3.eachCell((cell, cn) => {
        if (cn === 1) {
          cell.font = { bold: true };
        } else if (cell.value != null) {
          cell.font = { bold: true, size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
          cell.alignment = { horizontal: 'center' };
        }
        cell.border = { bottom: { style: 'thin' as any } };
      });
    }

    // Build per-column Excel number formats for number sources with UoM
    const colFormats = new Map<number, string>();
    let colIdx = 2; // col 1 is Y label
    for (const src of this.xSources()) {
      if (src.kind === 'number') {
        const uom = this.getUom(src.key);
        colFormats.set(colIdx, uom ? `0.00 "${uom}"` : '0.00');
      }
      colIdx += src.kind === 'enum' ? this.getEffectiveEnumValues(src.key).length : 1;
    }

    // Data rows
    for (const row of rows) {
      const values: (string | number)[] = [row.label];
      for (const cell of row.cells) {
        values.push(cell.raw ?? (cell.v as string | number));
      }
      const excelRow = ws.addRow(values);
      const isTotal = row.label === 'Total';
      excelRow.eachCell((cell, colNumber) => {
        if (colNumber > 1) {
          cell.alignment = { horizontal: 'right' };
        }
        if (isTotal) {
          cell.font = { bold: true };
        }
        const fmt = colFormats.get(colNumber);
        if (fmt) cell.numFmt = fmt;
        cell.border = { bottom: { style: 'thin' as any } };
      });
    }

    // Auto-width columns
    const colCount = ws.columnCount;
    for (let c = 1; c <= colCount; c++) {
      let maxLen = 10;
      ws.eachRow((row) => {
        const cell = row.getCell(c);
        const len = String(cell.value ?? '').length;
        if (len > maxLen) maxLen = len;
      });
      ws.getColumn(c)!.width = Math.min(maxLen * 1.2 + 2, 60);
    }

    const buffer = await wb.xlsx.writeBuffer();
    saveAsFn(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      'reports.xlsx'
    );
  }

  // ── Report Computation ──

  private computeReport(): void {
    const yKey = this.yDimension();
    const entities = this.filteredEntities();
    const cols = this.effectiveColumns();

    if (!yKey || entities.length === 0 || cols.length === 0) {
      this.reportData.set([]);
      return;
    }

    const yValues = this.collectYValues(yKey, entities);
    const dataRows: { label: string; cells: CellData[] }[] = [];

    // Identify which columns are "total" columns (no enum value) vs "detail" columns
    const totalColIndices: number[] = [];
    const detailByClass = new Map<string, number[]>();
    cols.forEach((c, i) => {
      if (!c.value) {
        totalColIndices.push(i);
      } else {
        const classKey = c.numericKey || c.key;
        const arr = detailByClass.get(classKey) ?? [];
        arr.push(i);
        detailByClass.set(classKey, arr);
      }
    });

    // Step 1: Compute detail cells for each y-value row
    for (const yVal of yValues) {
      const matchingApps = this.filterByYValue(yKey, yVal, entities);
      const cells: CellData[] = new Array(cols.length);

      for (let ci = 0; ci < cols.length; ci++) {
        const col = cols[ci];
        if (col.kind === 'count') {
          const count = col.value
            ? this.filterEnumValueMatch(col.sourceKey, col.value, matchingApps).length
            : matchingApps.length;
          cells[ci] = { v: count, title: count <= 10 ? this.appNames(
            col.value ? this.filterEnumValueMatch(col.sourceKey, col.value, matchingApps) : matchingApps
          ) : undefined };
        } else if (col.kind === 'number') {
          const aggKey = col.numericKey || col.key;
          if (col.value) {
            const scope = this.filterEnumValueMatch(col.sourceKey, col.value, matchingApps);
            const raw = this.aggregateNumeric(aggKey, scope);
            cells[ci] = { v: this.formatNumber(raw, aggKey), raw };
          } else {
            const raw = this.aggregateNumeric(aggKey, matchingApps);
            cells[ci] = { v: this.formatNumber(raw, aggKey), raw };
          }
        }
      }

      // Total columns in data rows: sum of detail columns of same value class (only when detail columns exist)
      if (detailByClass.size > 0) {
        for (const ti of totalColIndices) {
          const col = cols[ti];
          const classKey = col.numericKey || col.key;
          const sameClassDetails = detailByClass.get(classKey) ?? [];
          if (col.kind === 'count') {
            const sum = sameClassDetails.reduce((s, di) => s + (typeof cells[di]?.v === 'number' ? cells[di].v as number : 0), 0);
            cells[ti] = { v: sum };
          } else if (col.kind === 'number') {
            const rawSum = sameClassDetails.reduce((s, di) => s + (cells[di]?.raw ?? 0), 0);
            cells[ti] = { v: this.formatNumber(rawSum, classKey), raw: rawSum };
          }
        }
      }

      dataRows.push({ label: this.translateEnumValue(yKey, yVal), cells });
    }

    // Step 2: Total row = sum of data rows
    const totalCells: CellData[] = new Array(cols.length);
    for (let ci = 0; ci < cols.length; ci++) {
      const col = cols[ci];
      if (col.kind === 'count') {
        const sum = dataRows.reduce((s, r) => s + (typeof r.cells[ci]?.v === 'number' ? r.cells[ci].v as number : 0), 0);
        totalCells[ci] = { v: sum };
      } else if (col.kind === 'number') {
        const rawSum = dataRows.reduce((s, r) => s + (r.cells[ci]?.raw ?? 0), 0);
        totalCells[ci] = { v: this.formatNumber(rawSum, col.numericKey || col.key), raw: rawSum };
      }
    }

    this.reportData.set([...dataRows, { label: 'Total', cells: totalCells }]);
  }

  // ── Helpers ──

  private appNames(apps: ApplicationItem[]): string {
    return apps.map(a => a.displayName).join(', ');
  }

  private translateEnumValue(sourceKey: string, value: string): string {
    if (!value) return '—';
    const map = ENUM_LABEL_MAP[sourceKey];
    return map?.[value] ?? value;
  }

  getBubbleWidth(value: number | string, colIndex: number): number {
    if (typeof value !== 'number' || value <= 0) return 0;
    const col = this.effectiveColumns()[colIndex];
    const aggKey = col?.numericKey || col?.key;
    if (!aggKey) return 0;
    const classMax = this.classMaxValues().get(aggKey) ?? 0;
    return classMax > 0 ? Math.min((value / classMax) * 100, 100) : 0;
  }

  getXEnumValues(sourceKey: string): string[] {
    if (sourceKey.startsWith('tag:')) {
      const groupId = sourceKey.slice(4);
      const group = this.tagGroups().find(g => (g.id ?? g.name) === groupId);
      if (group?.tags) return group.tags.map(t => t.name ?? t.displayName ?? t.id ?? '').filter(Boolean);
      return [];
    }
    const builtIn = BUILT_IN_ATTRS.find(a => a.id === sourceKey);
    if (builtIn) return builtIn.values;
    const cf = this.customFields()[sourceKey];
    if (cf?.values) return [...cf.values];
    return [];
  }

  private filterEnumValueMatch(sourceKey: string, value: string, entities: ApplicationItem[]): ApplicationItem[] {
    if (sourceKey.startsWith('tag:')) {
      const groupId = sourceKey.slice(4);
      return entities.filter(e => e.tags?.some(t => (t.tagGroupId ?? '') === groupId && (t.name ?? '') === value));
    }
    if (sourceKey === 'lxTimeClassification') return entities.filter(e => (e.lxTimeClassification ?? '') === value);
    if (sourceKey === 'functionalSuitability') return entities.filter(e => ((e as Record<string, unknown>)['functionalSuitability'] as string ?? SUITABILITY_FILTER_EMPTY) === value);
    if (sourceKey === 'technicalSuitability') return entities.filter(e => ((e as Record<string, unknown>)['technicalSuitability'] as string ?? SUITABILITY_FILTER_EMPTY) === value);
    if (sourceKey === 'businessCriticality') return entities.filter(e => ((e as Record<string, unknown>)['businessCriticality'] as string ?? SUITABILITY_FILTER_EMPTY) === value);
    if (sourceKey === 'northStarClassification') return entities.filter(e => ((e as Record<string, unknown>)['northStarClassification'] as string ?? SUITABILITY_FILTER_EMPTY) === value);
    return entities.filter(e => {
      const v = (e as Record<string, unknown>)[sourceKey];
      if (Array.isArray(v)) {
        return v.some(item => typeof item === 'object' && item !== null
          ? (item as any).id === value || (item as any).name === value || (item as any).displayName === value
          : item === value);
      }
      if (v != null && typeof v === 'object') return (v as any).id === value || (v as any).name === value || (v as any).displayName === value;
      return String(v ?? '') === value;
    });
  }

  private collectYValues(yKey: string, entities: ApplicationItem[]): string[] {
    if (yKey.startsWith('tag:')) {
      const groupId = yKey.slice(4);
      const group = this.tagGroups().find(g => (g.id ?? g.name) === groupId);
      if (group?.tags) {
        const tagVals = group.tags.map(t => t.name ?? t.displayName ?? t.id ?? '').filter(Boolean);
        const hasEmpty = entities.some(e => !e.tags?.some(t => (t.tagGroupId ?? '') === groupId));
        if (hasEmpty) tagVals.push('');
        return tagVals;
      }
      return [];
    }
    const builtIn = BUILT_IN_ATTRS.find(a => a.id === yKey);
    if (builtIn) {
      const vals = [...builtIn.values];
      const hasEmpty = entities.some(e => {
        const v = (e as Record<string, unknown>)[yKey];
        return v == null || v === '' || (typeof v === 'string' && !vals.includes(v));
      });
      if (hasEmpty && !vals.includes('') && !vals.includes(SUITABILITY_FILTER_EMPTY)) vals.push('');
      return vals;
    }
    const cf = this.customFields()[yKey];
    if (cf?.values) {
      const vals = [...cf.values];
      const hasEmpty = entities.some(e => {
        const v = (e as Record<string, unknown>)[yKey];
        return v == null || v === '';
      });
      if (hasEmpty && !vals.includes('') && !vals.includes(SUITABILITY_FILTER_EMPTY)) vals.push('');
      return vals;
    }
    const vals = new Set<string>();
    for (const e of entities) {
      const v = (e as Record<string, unknown>)[yKey];
      if (v != null && v !== '') vals.add(String(v));
    }
    const result = [...vals].sort();
    const hasEmpty = entities.some(e => {
      const v = (e as Record<string, unknown>)[yKey];
      return v == null || v === '';
    });
    if (hasEmpty) result.push('');
    return result;
  }

  private filterByYValue(yKey: string, yVal: string, entities: ApplicationItem[]): ApplicationItem[] {
    const isEmpty = yVal === '';
    if (yKey.startsWith('tag:')) {
      const groupId = yKey.slice(4);
      if (isEmpty) return entities.filter(e => !e.tags?.some(t => (t.tagGroupId ?? '') === groupId));
      return entities.filter(e => e.tags?.some(t => (t.tagGroupId ?? '') === groupId && (t.name ?? '') === yVal));
    }
    const matchEmpty = (v: unknown) => v == null || v === '';
    if (yKey === 'lxTimeClassification') return entities.filter(e => isEmpty ? matchEmpty(e.lxTimeClassification) : (e.lxTimeClassification ?? '') === yVal);
    if (yKey === 'functionalSuitability') return entities.filter(e => isEmpty ? matchEmpty((e as Record<string, unknown>)['functionalSuitability']) : ((e as Record<string, unknown>)['functionalSuitability'] as string ?? SUITABILITY_FILTER_EMPTY) === yVal);
    if (yKey === 'technicalSuitability') return entities.filter(e => isEmpty ? matchEmpty((e as Record<string, unknown>)['technicalSuitability']) : ((e as Record<string, unknown>)['technicalSuitability'] as string ?? SUITABILITY_FILTER_EMPTY) === yVal);
    if (yKey === 'businessCriticality') return entities.filter(e => isEmpty ? matchEmpty((e as Record<string, unknown>)['businessCriticality']) : ((e as Record<string, unknown>)['businessCriticality'] as string ?? SUITABILITY_FILTER_EMPTY) === yVal);
    if (yKey === 'northStarClassification') return entities.filter(e => isEmpty ? matchEmpty((e as Record<string, unknown>)['northStarClassification']) : ((e as Record<string, unknown>)['northStarClassification'] as string ?? SUITABILITY_FILTER_EMPTY) === yVal);
    return entities.filter(e => {
      const v = (e as Record<string, unknown>)[yKey];
      if (isEmpty || yVal === SUITABILITY_FILTER_EMPTY) return matchEmpty(v);
      if (Array.isArray(v)) return v.includes(yVal);
      return String(v ?? '') === yVal;
    });
  }

  private aggregateNumeric(key: string, entities: ApplicationItem[]): number {
    const values: number[] = [];
    for (const e of entities) {
      const v = (e as Record<string, unknown>)[key];
      const num = typeof v === 'number' ? v : parseFloat(String(v));
      if (!isNaN(num)) values.push(num);
    }
    if (values.length === 0) return 0;
    const mode = this.aggMode();
    switch (mode) {
      case 'Sum': return values.reduce((a, b) => a + b, 0);
      case 'Average': return values.reduce((a, b) => a + b, 0) / values.length;
      case 'Max': return Math.max(...values);
      case 'Min': return Math.min(...values);
    }
  }

  getYLabel(yKey: string): string {
    if (yKey.startsWith('tag:')) {
      const groupId = yKey.slice(4);
      const group = this.tagGroups().find(g => (g.id ?? g.name) === groupId);
      return `Tag: ${group?.displayName ?? group?.name ?? groupId}`;
    }
    const builtIn = BUILT_IN_ATTRS.find(a => a.id === yKey);
    if (builtIn) return builtIn.label;
    const cf = this.customFields()[yKey];
    if (cf) return cf.label?.['en'] ?? cf.label?.[Object.keys(cf.label)[0]] ?? yKey;
    return yKey;
  }

  getXLabel(xKey: string): string {
    return this.getYLabel(xKey);
  }

  getNumericLabel(key: string): string {
    const cf = this.customFields()[key];
    if (cf) {
      const label = cf.label?.['en'] ?? cf.label?.[Object.keys(cf.label)[0]] ?? key;
      return cf.uom ? `${label} (${cf.uom})` : label;
    }
    return key;
  }

  private getUom(key: string): string | undefined {
    return this.customFields()[key]?.uom;
  }

  formatNumber(value: number, key: string): string {
    const formatted = formatCustomNumber(value, this.customFields()[key]?.format);
    const uom = this.getUom(key);
    return uom ? `${formatted} ${uom}` : formatted;
  }

  private pushReportToUrl(): void {
    const cfg: ReportConfig = {};

    const yKey = this.yDimension();
    if (yKey) cfg.y = yKey;

    const xdKey = this.xDimension();
    const vals = this.values();
    const isDefaultX = !xdKey && vals.length === 1 && vals[0].key === 'count';
    if (!isDefaultX) {
      const xKeys: string[] = [];
      if (xdKey) xKeys.push(xdKey);
      for (const v of vals) xKeys.push(v.key);
      cfg.x = xKeys;
    }

    const agg = this.aggMode();
    if (agg !== 'Sum') cfg.agg = agg;

    const style = this.displayStyle();
    if (style !== 'table') cfg.style = style;

    if (style === 'histogram') {
      const buckets = this.numBuckets();
      if (buckets !== 25) cfg.buckets = buckets;
      const barHeight = this.barHeightMode();
      if (barHeight !== 'Sum') cfg.barHeight = barHeight;
    }

    const hasData = cfg.y || cfg.x;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [REPORT_QP]: hasData ? encodeURIComponent(JSON.stringify(cfg)) : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private updateUrlQueryParams(filters: EntityListFilters): void {
    const qp: Record<string, string | null> = {};
    qp[this.QP.name] = filters.name || null;
    qp[this.QP.status] = filters.status === 'ACTIVE' ? null : filters.status;
    qp[this.QP.techSuit] = filters.technicalSuitability || null;
    qp[this.QP.bizSuit] = filters.functionalSuitability || null;
    qp[this.QP.timeClass] = filters.lxTimeClassification || null;
    qp[this.QP.northStar] = filters.northStarClassification || null;
    qp[this.QP.bizCrit] = filters.businessCriticality || null;
    qp[this.QP.bizCap] = filters.relApplicationToBusinessCapability || null;
    qp[this.QP.bizCapMode] = filters.relApplicationToBusinessCapabilityMode === 'exact' ? 'exact' : null;
    qp[this.QP.userGroup] = filters.relApplicationToUserGroup || null;
    qp[this.QP.userGroupMode] = filters.relApplicationToUserGroupMode === 'exact' ? 'exact' : null;
    qp[this.QP.project] = filters.relApplicationToProject || null;
    qp[this.QP.dataProduct] = filters.relApplicationToDataProduct || null;
    qp[this.QP.tags] = filters.tags?.length ? filters.tags.join(',') : null;
    qp[this.QP.tagGroups] = filters.tagGroups?.length ? filters.tagGroups.join(',') : null;
    if (filters.customFields && Object.keys(filters.customFields).length > 0) {
      qp[this.QP.customFields] = JSON.stringify(filters.customFields);
    } else {
      qp[this.QP.customFields] = null;
    }
    qp[this.QP.customFieldIds] = filters.customFieldIds?.length ? filters.customFieldIds.join(',') : null;
    qp[this.QP.pills] = filters.visiblePills?.length ? filters.visiblePills.join(',') : null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: qp,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
