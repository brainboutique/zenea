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
import { TranslateModule } from '@ngx-translate/core';
import { TimeClassificationComponent } from '../time-classification/time-classification.component';

@Component({
  selector: 'app-edit-field-time',
  standalone: true,
  imports: [CommonModule, TranslateModule, TimeClassificationComponent],
  template: `
    <div class="form-field-like">
      <span class="mat-label">{{ label() | translate }}</span>
      <div class="suitability-field">
        <app-time-classification
          [data]="data()!"
          [field]="field()"
          [description]="description()"
          [readOnly]="readOnly()"
          [showLabel]="true"
          [onMutated]="onMutated()"
        />
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
    .form-field-like {
      margin-bottom: 1rem;
    }
    .mat-label {
      display: block;
      margin-bottom: 0.25rem;
      font-size: 0.75rem;
      color: rgba(0, 0, 0, 0.6);
    }
    .suitability-field {
      padding: 0.5rem 0;
    }
  `],
})
export class EditFieldTimeComponent {
  data = input.required<Record<string, unknown>>();
  field = input.required<string>();
  label = input.required<string>();
  description = input<string | null>(null);
  readOnly = input<boolean>(false);
  onMutated = input<() => void>(() => {});
}
