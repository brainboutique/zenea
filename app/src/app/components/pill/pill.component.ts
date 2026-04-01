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

@Component({
  selector: 'app-pill',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="pill"
      [class.fit-content]="fitContent()"
      [style.background]="backgroundColor()"
      [attr.title]="title() ?? undefined"
    >{{ label() }}</span>
  `,
  styles: [`
    .pill {
      display: inline-block;
      max-width: 60px;
      padding: 0.25rem 0.5rem;
      border-radius: 1rem;
      font-size: 0.875rem;
      color: #fff;
      text-shadow: 0 0 1px rgba(0,0,0,0.3);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .pill.fit-content {
      max-width: none;
      overflow: visible;
      text-overflow: clip;
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
}
