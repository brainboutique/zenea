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

import { Component, input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

export const SUITABILITY_VALUES = [
  'inappropriate',
  'unreasonable',
  'adequate',
  'fullyAppropriate',
] as const;

export type SuitabilityValue = (typeof SUITABILITY_VALUES)[number];

export const CRITICALITY_VALUES = [
  'administrativeService',
  'businessOperational',
  'businessCritical',
  'missionCritical',
] as const;

export type CriticalityValue = (typeof CRITICALITY_VALUES)[number];

type RatingVariant = 'suitability' | 'criticality';

interface LevelConfig {
  valueToLevel: Record<string, number>;
  levelToValue: Record<number, string>;
  valueToLabel: Record<string, string>;
  iconFilled: string;
  iconUnfilled: string;
}

const SUITABILITY_CONFIG: LevelConfig = {
  valueToLevel: {
    inappropriate: 1,
    unreasonable: 2,
    adequate: 3,
    fullyAppropriate: 4,
  },
  levelToValue: {
    1: 'inappropriate',
    2: 'unreasonable',
    3: 'adequate',
    4: 'fullyAppropriate',
  },
  valueToLabel: {
    inappropriate: 'Inappropriate',
    unreasonable: 'Unreasonable',
    adequate: 'Adequate',
    fullyAppropriate: 'Fully appropriate',
  },
  iconFilled: 'star',
  iconUnfilled: 'star_border',
};

const CRITICALITY_CONFIG: LevelConfig = {
  valueToLevel: {
    administrativeService: 1,
    businessOperational: 2,
    businessCritical: 3,
    missionCritical: 4,
  },
  levelToValue: {
    1: 'administrativeService',
    2: 'businessOperational',
    3: 'businessCritical',
    4: 'missionCritical',
  },
  valueToLabel: {
    administrativeService: 'Administrative service',
    businessOperational: 'Business operational',
    businessCritical: 'Business critical',
    missionCritical: 'Mission critical',
  },
  iconFilled: 'arrow_upward',
  iconUnfilled: 'arrow_upward',
};

@Component({
  selector: 'app-suitability-rating',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <span class="level-rating" [class.rating-arrows]="variant() === 'criticality'">
      @if (hasRating()) {
        @for (level of [1, 2, 3, 4]; track level) {
          @if (readOnly()) {
            <span class="level-btn" [attr.aria-label]="getLabel(level)">
              <mat-icon
                class="level-icon"
                [class.filled]="level <= filledCount()"
                [class.unfilled]="level > filledCount()"
              >
                {{ level <= filledCount() ? config().iconFilled : config().iconUnfilled }}
              </mat-icon>
            </span>
          } @else {
            <button type="button" class="level-btn" (click)="setLevel(level)" [attr.aria-label]="getLabel(level)">
              <mat-icon
                class="level-icon"
                [class.filled]="level <= filledCount()"
                [class.unfilled]="level > filledCount()"
              >
                {{ level <= filledCount() ? config().iconFilled : config().iconUnfilled }}
              </mat-icon>
            </button>
          }
        }
        @if (label() && showLabel()) {
          <span class="label">{{ label() }}</span>
        }
      } @else {
        @for (level of [1, 2, 3, 4]; track level) {
          @if (readOnly()) {
            <span class="level-btn"><mat-icon class="level-icon unfilled">{{ config().iconUnfilled }}</mat-icon></span>
          } @else {
            <button type="button" class="level-btn" (click)="setLevel(level)" [attr.aria-label]="getLabel(level)">
              <mat-icon class="level-icon unfilled">{{ config().iconUnfilled }}</mat-icon>
            </button>
          }
        }
        @if (label() && showLabel()) {
            <span class="empty">—</span>
        }
      }
    </span>
  `,
  styles: [`
    .level-rating {
      display: inline-flex;
      align-items: center;
      gap: 0.125rem;
    }
    .level-btn {
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
      line-height: 0;
    }
    .level-btn:hover .level-icon {
      opacity: 0.85;
    }
    .level-icon {
      width: 1.25rem;
      height: 1.25rem;
      font-size: 1.25rem;
    }
    .level-icon.filled {
      color: #ffc107;
    }
    .level-icon.unfilled {
      color: #ccc;
    }
    .level-rating.rating-arrows .level-icon.filled {
      color: #2e7d32;
    }
    .level-rating.rating-arrows .level-icon.unfilled {
      color: #ccc;
      opacity: 0.5;
    }
    .label {
      margin-left: 0.5rem;
      font-size: 0.875rem;
    }
    .empty {
      color: #999;
      margin-left: 0.25rem;
    }
  `],
})
export class SuitabilityRatingComponent {
  /** Data object (by reference). This component will mutate data[field] on click. */
  data = input.required<Record<string, unknown>>();
  /** Key on data to read/write (e.g. 'functionalSuitability', 'businessCriticality'). */
  field = input.required<string>();
  /** 'suitability' = star icons, 4 suitability values; 'criticality' = arrow icons, 4 criticality values. */
  variant = input<RatingVariant>('suitability');
  /** When true, only display the rating (no click, no mutation). Use with [data] for display-only. */
  readOnly = input<boolean>(false);
  /** When false (e.g. compact mode), hide the text label and show only stars. */
  showLabel = input<boolean>(true);
  /** Called after mutating data so the root can sync derived state (e.g. raw JSON). */
  onMutated = input<() => void>(() => {});

  /** Bump after mutating so the template re-renders (data reference is unchanged). */
  private version = signal(0);

  config = computed(() => (this.variant() === 'criticality' ? CRITICALITY_CONFIG : SUITABILITY_CONFIG));

  value = computed(() => {
    this.version();
    const d = this.data();
    const key = this.field();
    if (!d || !key) return null;
    const v = d[key];
    return v === undefined || v === null ? null : String(v).trim();
  });

  filledCount = computed(() => {
    const v = this.value();
    const cfg = this.config();
    if (!v || !(v in cfg.valueToLevel)) return -1;
    return cfg.valueToLevel[v];
  });

  label = computed(() => {
    const v = this.value();
    const cfg = this.config();
    if (!v) return null;
    return cfg.valueToLabel[v] ?? v;
  });

  hasRating = computed(() => this.filledCount() >= 0);

  getLabel(level: number): string {
    const cfg = this.config();
    const val = cfg.levelToValue[level];
    return (val && cfg.valueToLabel[val]) ?? `Set to level ${level}`;
  }

  setLevel(level: number): void {
    if (this.readOnly()) return;
    const cfg = this.config();
    const val = cfg.levelToValue[level];
    if (!val) return;
    const d = this.data();
    const key = this.field();
    if (!d || !key) return;
    d[key] = val;
    this.version.update((v) => v + 1);
    this.onMutated()?.();
  }
}
