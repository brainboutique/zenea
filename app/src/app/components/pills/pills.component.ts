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
import { PillComponent } from '../pill/pill.component';
import { PillItem } from './pill-item';

@Component({
  selector: 'app-pills',
  standalone: true,
  imports: [CommonModule, PillComponent],
  template: `
    <div class="pills">
      @for (item of items(); track item.label + $index) {
        <app-pill
          [label]="item.label"
          [backgroundColor]="item.color ?? '#999'"
          [title]="item.title ?? null"
          [fitContent]="fitContent()"
        />
      }
    </div>
  `,
  styles: [`
    .pills {
      display: flex;
      flex-wrap: wrap;
      gap: 0px 10px;
      margin-top:4px;
      align-items: center;
    }
  `],
})
export class PillsComponent {
  /** List of items to render as pills. */
  items = input.required<PillItem[]>();
  /** If true, allow pill text without ellipsis cropping. */
  fitContent = input<boolean>(false);
}
