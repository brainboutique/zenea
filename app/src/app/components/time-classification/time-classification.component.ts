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

/** TIME classification values (single value per entity). */
export const TIME_CLASSIFICATION_VALUES = ['tolerate', 'invest', 'migrate', 'eliminate'] as const;
export type TimeClassificationValue = (typeof TIME_CLASSIFICATION_VALUES)[number];

const LETTER_TO_VALUE: Record<string, TimeClassificationValue> = {
  T: 'tolerate',
  I: 'invest',
  M: 'migrate',
  E: 'eliminate',
};

const VALUE_TO_LETTER: Record<TimeClassificationValue, string> = {
  tolerate: 'T',
  invest: 'I',
  migrate: 'M',
  eliminate: 'E',
};

const VALUE_TO_LABEL: Record<TimeClassificationValue, string> = {
  tolerate: 'Tolerate',
  invest: 'Invest',
  migrate: 'Migrate',
  eliminate: 'Eliminate',
};

/** Background color for each letter when that option is selected. */
const BOX_COLORS: Record<string, string> = {
  T: '#12cbed',   // blue (tolerate)
  I: '#19c822',   // green (invest)
  M: '#ed8702',   // orange (migrate)
  E: '#c62828',   // red (eliminate)
};

const DEFAULT_BOX_BG = '#e0e0e0';

@Component({
  selector: 'app-time-classification',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <span class="time-classification" role="group" aria-label="TIME classification">
      @for (letter of letters; track letter) {
        @if (readOnly()) {
          <span
            class="box"
            [class.selected]="isSelected(letter)"
            [style.background]="getBoxBackground(letter)"
            [attr.aria-label]="getAriaLabel(letter)"
            [attr.title]="getBoxTitle(letter)"
          >{{ letter }}</span>
        } @else {
          <button
            type="button"
            class="box box-btn"
            [class.selected]="isSelected(letter)"
            [style.background]="getBoxBackground(letter)"
            [attr.aria-label]="getAriaLabel(letter)"
            [attr.title]="getBoxTitle(letter)"
            (click)="onBoxClick(letter)"
          >{{ letter }}</button>
        }
      }
      @if (showLabel() && currentLabel()) {
        <span class="label">{{ currentLabel() }}</span>
      }
      @if (description()) {
        <mat-icon class="desc-icon" [attr.title]="description()">sticky_note_2</mat-icon>
      }
    </span>
  `,
  styles: [`
    .time-classification {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .box {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      font-size: 12px;
      font-weight: 600;
      color: rgba(0,0,0,0.6);
      border-radius: 3px;
      border: 1px solid rgba(0,0,0,0.12);
      box-sizing: border-box;
    }
    .box.selected {
      color: #fff;
      text-shadow: 0 0 1px rgba(0,0,0,0.3);
    }
    .box-btn {
      padding: 0;
      border: 1px solid rgba(0,0,0,0.2);
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .box-btn:hover {
      opacity: 0.9;
    }
    .box-btn:focus-visible {
      outline: 2px solid #1976d2;
      outline-offset: 1px;
    }
    .label {
      margin-left: 0.5rem;
      font-size: 0.875rem;
      color: rgba(0,0,0,0.87);
    }
    .desc-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      line-height: 14px;
      color: #f9a825;
      margin-left: 3px;
      vertical-align: middle;
      cursor: default;
    }
  `],
})
export class TimeClassificationComponent {
  /** Current value (use for display-only / list). */
  value = input<string | null>(null);
  /** Data object for edit mode; when set with field(), component mutates data[field] and calls onMutated(). */
  data = input<Record<string, unknown> | null>(null);
  /** Key on data to read/write (e.g. 'lxTimeClassification'). Used when data() is provided. */
  field = input<string>('lxTimeClassification');
  /** When true, boxes are not clickable. */
  readOnly = input<boolean>(false);
  /** When true, show the full label (e.g. "Tolerate", "Invest") after the TIME boxes. */
  showLabel = input<boolean>(false);
  /** Optional description shown as title (tooltip) on mouse over. */
  description = input<string | null>(null);
  /** Called after mutating data (edit mode). */
  onMutated = input<() => void>(() => {});

  private version = signal(0);

  readonly letters = ['T', 'I', 'M', 'E'] as const;

  /** Effective current value: from data[field] in edit mode, else from value(). */
  currentValue = computed(() => {
    this.version();
    const d = this.data();
    const field = this.field();
    if (d && field && d[field] !== undefined && d[field] !== null) {
      const v = String(d[field]).trim().toLowerCase();
      if (TIME_CLASSIFICATION_VALUES.includes(v as TimeClassificationValue)) {
        return v as TimeClassificationValue;
      }
    }
    const v = this.value();
    if (v && typeof v === 'string') {
      const trimmed = v.trim().toLowerCase();
      if (TIME_CLASSIFICATION_VALUES.includes(trimmed as TimeClassificationValue)) {
        return trimmed as TimeClassificationValue;
      }
    }
    return null;
  });

  /** Full label for the current value when showLabel is true (e.g. "Tolerate", "Invest"). */
  currentLabel = computed(() => {
    const v = this.currentValue();
    return v ? (VALUE_TO_LABEL[v] ?? v) : null;
  });

  isSelected(letter: string): boolean {
    const val = this.currentValue();
    if (!val) return false;
    return VALUE_TO_LETTER[val] === letter;
  }

  getBoxBackground(letter: string): string {
    const selected = this.currentValue();
    const letterValue = LETTER_TO_VALUE[letter];
    if (selected && VALUE_TO_LETTER[selected] === letter) {
      return BOX_COLORS[letter] ?? DEFAULT_BOX_BG;
    }
    return DEFAULT_BOX_BG;
  }

  getAriaLabel(letter: string): string {
    const val = LETTER_TO_VALUE[letter];
    return val ? (VALUE_TO_LABEL[val] ?? letter) : letter;
  }

  getBoxTitle(letter: string): string {
    const label = this.getAriaLabel(letter);
    if (this.isSelected(letter)) {
      const desc = this.description();
      if (desc) return `${label} - ${desc}`;
    }
    return label;
  }

  onBoxClick(letter: string): void {
    if (this.readOnly()) return;
    const targetValue = LETTER_TO_VALUE[letter];
    if (!targetValue) return;
    const current = this.currentValue();
    const d = this.data();
    const field = this.field();
    if (d && field) {
      if (current === targetValue) {
        d[field] = null;
      } else {
        d[field] = targetValue;
      }
      this.version.update((v) => v + 1);
      this.onMutated()?.();
      return;
    }
    this.version.update((v) => v + 1);
  }
}
