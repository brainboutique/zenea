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
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslateModule } from '@ngx-translate/core';

export type EditFieldType = 'text' | 'textarea' | 'number' | 'selectSingle' | 'selectMultiple';

export type EditFieldData = Record<string, unknown>;

@Component({
  selector: 'app-edit-field',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, TranslateModule],
  template: `
    @if (type() === 'textarea') {
      <mat-form-field appearance="outline" [class]="formFieldClass()">
        <mat-label>{{ label() | translate }}</mat-label>
        <textarea
          matInput
          cdkTextareaAutosize
          cdkAutosizeMinRows="2"
          cdkAutosizeMaxRows="12"
          [ngModel]="stringValue()"
          (ngModelChange)="onStringChange($event)"
          placeholder="—"
          [readonly]="readOnly()"
        ></textarea>
      </mat-form-field>
    } @else if (type() === 'number') {
      <mat-form-field appearance="outline" [class]="formFieldClass()">
        <mat-label>{{ label() | translate }}</mat-label>
        <input
          matInput
          type="number"
          class="number-input"
          [ngModel]="numberValue()"
          (ngModelChange)="onNumberChange($event)"
          [placeholder]="'0' | translate"
          [readonly]="readOnly()"
        />
        @if (uom() && numberValue() !== null && numberValue() !== undefined) {
          <span matSuffix class="uom-suffix">{{ uom() }}</span>
        }
      </mat-form-field>
    } @else if (type() === 'selectSingle') {
      <mat-form-field appearance="outline" [class]="formFieldClass()">
        <mat-label>{{ label() | translate }}</mat-label>
        <mat-select
          [value]="stringValue()"
          (selectionChange)="onStringChange($event.value)"
          [disabled]="readOnly()"
        >
          <mat-option value="">{{ '— None —' | translate }}</mat-option>
          @for (opt of options(); track opt) {
            <mat-option [value]="opt">{{ opt }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    } @else if (type() === 'selectMultiple') {
      <mat-form-field appearance="outline" [class]="formFieldClass()">
        <mat-label>{{ label() | translate }}</mat-label>
        <mat-select
          multiple
          [value]="arrayValue()"
          (selectionChange)="onArrayChange($event.value)"
          [disabled]="readOnly()"
        >
          @for (opt of options(); track opt) {
            <mat-option [value]="opt">{{ opt }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    } @else {
      <mat-form-field appearance="outline" [class]="formFieldClass()">
        <mat-label>{{ label() | translate }}</mat-label>
        <input
          matInput
          [ngModel]="stringValue()"
          (ngModelChange)="onStringChange($event)"
          [placeholder]="(label() + '...') | translate"
          [readonly]="readOnly()"
        />
        @if (uom() && stringValue()) {
          <span matSuffix class="uom-suffix">{{ uom() }}</span>
        }
      </mat-form-field>
    }
  `,
  styles: [`
    :host {
      display: block;
      margin-bottom: 1rem;
    }
    :host:last-child {
      margin-bottom: 0;
    }
    .full-width {
      width: 100%;
    }
    // Must not use :host, else not working!
    ::ng-deep .number-field .mat-mdc-form-field-infix input {
      text-align: right;
    }
    ::ng-deep .mat-mdc-form-field-icon-suffix .uom-suffix{
      margin-right: 6px;
    }
    .uom-suffix {
      color: rgba(0, 0, 0, 0.6);
      font-size: 0.875rem;
      user-select: none;
      pointer-events: none;
    }
  `],
})
export class EditFieldComponent {
  data = input.required<EditFieldData>();
  field = input.required<string>();
  type = input<EditFieldType>('text');
  label = input.required<string>();
  readOnly = input<boolean>(false);
  onMutated = input<() => void>(() => {});
  options = input<string[]>([]);
  uom = input<string>('');

  private version = signal(0);

  formFieldClass = computed(() => `full-width${this.type() === 'number' ? ' number-field' : ''}`);

  stringValue = computed(() => {
    this.version();
    const val = this.data()?.[this.field()];
    return val !== undefined && val !== null ? String(val) : '';
  });

  numberValue = computed(() => {
    this.version();
    const val = this.data()?.[this.field()];
    if (val === null || val === undefined || val === '') return null;
    const num = Number(val);
    return Number.isNaN(num) ? null : num;
  });

  arrayValue = computed(() => {
    this.version();
    const val = this.data()?.[this.field()];
    return Array.isArray(val) ? val : [];
  });

  onStringChange(value: string): void {
    if (this.readOnly()) return;
    const d = this.data();
    const key = this.field();
    if (!d || !key) return;
    d[key] = value || null;
    this.version.update(v => v + 1);
    this.onMutated()?.();
  }

  onNumberChange(value: number | null): void {
    if (this.readOnly()) return;
    const d = this.data();
    const key = this.field();
    if (!d || !key) return;
    d[key] = value;
    this.version.update(v => v + 1);
    this.onMutated()?.();
  }

  onArrayChange(values: string[]): void {
    if (this.readOnly()) return;
    const d = this.data();
    const key = this.field();
    if (!d || !key) return;
    d[key] = values;
    this.version.update(v => v + 1);
    this.onMutated()?.();
  }
}
