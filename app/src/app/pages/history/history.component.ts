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

import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { UserConfigService } from '../../services/user-config.service';
import { HttpClient } from '@angular/common/http';

interface KpiHistoryEntry {
  date: string;
  updated: string;
  _lastFileMtime: number;
  KPIs: Record<string, unknown>;
}

interface KpiMetricOption {
  key: string;
  label: string;
}

interface EchartsSeriesOption {
  name: string;
  type: string;
  stack?: string;
  areaStyle: Record<string, unknown>;
  emphasis: Record<string, unknown>;
  data: ([number, number] | number)[];
}

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [
    CommonModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatIconModule,
    TranslatePipe,
    NgxEchartsDirective,
  ],
  templateUrl: './history.component.html',
  styleUrl: './history.component.scss',
})
export class HistoryComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly userConfig = inject(UserConfigService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly historyData = signal<KpiHistoryEntry[]>([]);
  readonly selectedMetrics = signal<string[]>(['Application.count']);
  readonly allMetrics = signal<KpiMetricOption[]>([]);
  readonly metricFilter = signal('');

  readonly sortedMetrics = computed(() => {
    return [...this.allMetrics()].sort((a, b) => a.label.localeCompare(b.label));
  });

  readonly visibleKeys = computed(() => {
    const filter = this.metricFilter().toLowerCase();
    if (!filter) {
      return null;
    }
    return new Set(
      this.allMetrics()
        .filter((m) => m.label.toLowerCase().includes(filter) || m.key.toLowerCase().includes(filter))
        .map((m) => m.key),
    );
  });

  isVisible(metric: KpiMetricOption): boolean {
    const v = this.visibleKeys();
    return v === null || v.has(metric.key);
  }

  readonly chartOptions = computed(() => {
    const data = this.historyData();
    const metrics = this.selectedMetrics();
    if (data.length === 0 || metrics.length === 0) {
      return null;
    }

    const timestamps = data.map((e) => new Date(e.date).getTime());

    const series: EchartsSeriesOption[] = metrics.map((metricKey) => {
      const parts = metricKey.split('.');
      const label = this.formatMetricLabel(metricKey);

      const values = data.map((entry, i) => {
        let val: unknown = entry.KPIs;
        for (const part of parts) {
          if (val === null || val === undefined || typeof val !== 'object') {
            return [timestamps[i], 0] as [number, number];
          }
          val = (val as Record<string, unknown>)[part];
        }
        const num = typeof val === 'number' ? val : 0;
        return [timestamps[i], num] as [number, number];
      });

      const stackGroup = parts.length >= 3 ? `${parts[0]}.${parts[1]}` : undefined;

      return {
        name: label,
        type: 'line' as const,
        stack: stackGroup,
        areaStyle: {},
        emphasis: { focus: 'series' as const },
        data: values,
      };
    });

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
      },
      legend: {
        data: metrics.map((m) => this.formatMetricLabel(m)),
        type: 'scroll' as const,
        bottom: 0,
      },
      grid: {
        left: 60,
        right: 30,
        top: 20,
        bottom: 60,
      },
      xAxis: {
        type: 'time' as const,
      },
      yAxis: {
        type: 'value' as const,
      },
      dataZoom: [
        {
          type: 'slider' as const,
          show: timestamps.length > 15,
          bottom: 30,
          start: Math.max(0, 100 - (15 / timestamps.length) * 100),
          end: 100,
        },
      ],
      series,
    };
  });

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      if (params['metrics']) {
        const metrics = Array.isArray(params['metrics']) ? params['metrics'] : [params['metrics']];
        this.selectedMetrics.set(metrics);
      }
    });

    this.loadHistory();
  }

  private loadHistory(): void {
    this.loading.set(true);
    const repo = this.userConfig.getRepoName().trim() || 'local';
    const branch = this.userConfig.getBranch().trim() || 'default';

    this.http.get<{ history: KpiHistoryEntry[] }>(
      `/api/v1/${repo}/${branch}/history/KPIs`
    ).subscribe({
      next: (res) => {
        this.historyData.set(res.history || []);
        this.buildMetricsList(res.history || []);
        this.loading.set(false);
      },
      error: () => {
        this.historyData.set([]);
        this.loading.set(false);
      },
    });
  }

  private buildMetricsList(history: KpiHistoryEntry[]): void {
    if (history.length === 0) {
      this.allMetrics.set([]);
      return;
    }

    const metricsMap = new Map<string, KpiMetricOption>();

    for (const entry of history) {
      for (const entityType of Object.keys(entry.KPIs)) {
        const entityData = (entry.KPIs as Record<string, unknown>)[entityType];
        if (typeof entityData !== 'object' || entityData === null) {
          continue;
        }

        const countKey = `${entityType}.count`;
        if (!metricsMap.has(countKey)) {
          metricsMap.set(countKey, { key: countKey, label: `${entityType} - Count` });
        }

        for (const attrKey of Object.keys(entityData as Record<string, unknown>)) {
          if (attrKey === 'count') {
            continue;
          }
          const attrVal = (entityData as Record<string, unknown>)[attrKey];
          if (typeof attrVal !== 'object' || attrVal === null || Array.isArray(attrVal)) {
            continue;
          }

          for (const valueKey of Object.keys(attrVal as Record<string, unknown>)) {
            if (typeof (attrVal as Record<string, unknown>)[valueKey] === 'number') {
              const metricKey = `${entityType}.${attrKey}.${valueKey}`;
              if (!metricsMap.has(metricKey)) {
                metricsMap.set(metricKey, {
                  key: metricKey,
                  label: `${entityType} - ${attrKey} - ${valueKey}`,
                });
              }
            }
          }
        }
      }
    }

    this.allMetrics.set(Array.from(metricsMap.values()));
  }

  formatMetricLabel(key: string): string {
    return key.split(' - ').length > 1 ? key : key.replace(/\./g, ' - ');
  }

  onMetricsChange(keys: string[]): void {
    this.selectedMetrics.set(keys);
    this.pushMetricsToUrl(keys);
  }

  private pushMetricsToUrl(metrics: string[]): void {
    const queryParams = metrics.length > 0 ? { metrics } : {};
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
}
