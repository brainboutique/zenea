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

import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-pill',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <span
      class="pill"
      [class.fit-content]="fitContent()"
      [class.pill--deleted]="deleted()"
      [class.pill--inactive]="inactive()"
      [class.pill--coverage]="hasCoverage"
      [style.--coverage-pct]="coveragePercent + '%'"
      [style.--pill-color]="backgroundColor()"
      [attr.title]="title() ?? undefined"
    >
      @if (notes()) {
        <mat-icon class="pill-notes-icon">sticky_note_2</mat-icon>
      }
      <span class="pill-label">{{ label() }}</span>
    </span>
  `,
  styles: [`
    :host {
      display: inline-block;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      max-width: 60px;
      padding: 0.25rem 0.5rem;
      border-radius: 1rem;
      font-size: 0.875rem;
      color: #fff;
      text-shadow: 0 0 1px rgba(0,0,0,0.3);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      position: relative;
      background: var(--pill-color, #999);
    }

    .pill.fit-content {
      max-width: none;
      overflow: visible;
      text-overflow: clip;
    }

    .pill--deleted {
      text-decoration: line-through;
      opacity: 0.45;
    }

    .pill--inactive {
      text-decoration: line-through;
      opacity: 0.6;
    }

    /* Progress bar pill: 45° angled edge between dark (coverage) and light (remainder) */
    .pill--coverage {
      background:
        linear-gradient(
          45deg,
          var(--pill-color, #666) 0%,
          var(--pill-color, #666) var(--coverage-pct, 0%),
          #d9d9d9 var(--coverage-pct, 0%),
          #d9d9d9 100%
        );
      color: #333;
      text-shadow: none;
    }

    .pill-notes-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      margin-right: 3px;
      flex-shrink: 0;
      vertical-align: middle;
      opacity: 0.7;
    }

    .pill--coverage .pill-notes-icon {
      opacity: 0.85;
    }

    .pill-label {
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `],
})
export class PillComponent {
  /** Pill text. */
  label = input.required<string>();
  /** Background color (CSS value, e.g. #hex or rgb()). */
  backgroundColor = input<string>('#999');
  /** Tooltip/title (e.g. description). */
  title = input<string | null>(null);
  /** If true, allow full pill text without ellipsis cropping. */
  fitContent = input<boolean>(false);
  /** If true, render with line-through and reduced opacity to indicate the target no longer exists. */
  deleted = input<boolean>(false);
  /** If true, render with line-through to indicate the target is inactive. */
  inactive = input<boolean>(false);
  /** Coverage percentage (0-100) for progress bar display. */
  coverage = input<number | undefined>(undefined);
  /** If true, show a notes icon before the label. */
  notes = input<boolean>(false);

  get hasCoverage(): boolean {
    const c = this.coverage();
    return c != null && c >= 0 && c <= 100;
  }

  get coveragePercent(): number {
    return this.coverage() ?? 0;
  }
}
