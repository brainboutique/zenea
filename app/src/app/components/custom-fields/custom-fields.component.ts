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
import { TranslateModule } from '@ngx-translate/core';
import { EditFieldComponent } from '../edit-field/edit-field.component';
import type { CustomFieldDefinition } from '../../services/model-definitions.service';

@Component({
  selector: 'app-custom-fields',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    EditFieldComponent,
  ],
  templateUrl: './custom-fields.component.html',
  styleUrl: './custom-fields.component.scss',
})
export class CustomFieldsComponent {
  customFields = input.required<Record<string, CustomFieldDefinition>>();
  entityData = input.required<Record<string, unknown>>();
  readOnly = input<boolean>(false);
  onDataMutated = input<() => void>(() => {});

  /** Bump after any mutation so edit-field components re-render. */
  private dataVersion = signal(0);

  fieldKeys = computed(() => {
    this.dataVersion();
    return Object.keys(this.customFields());
  });

  fieldDef(fieldKey: string): CustomFieldDefinition | undefined {
    return this.customFields()[fieldKey];
  }

  fieldLabel(fieldKey: string): string {
    const def = this.fieldDef(fieldKey);
    if (!def) return fieldKey;
    return def.label?.['en'] ?? def.label?.[Object.keys(def.label)[0]] ?? fieldKey;
  }

  fieldOptions(fieldKey: string): string[] {
    const def = this.fieldDef(fieldKey);
    return def?.values ?? [];
  }

  fieldUom(fieldKey: string): string {
    const def = this.fieldDef(fieldKey);
    return def?.uom ?? '';
  }

  /** Callback for edit-field components to trigger re-render. */
  onFieldMutated = (): void => {
    this.dataVersion.update(v => v + 1);
    this.onDataMutated()?.();
  }
}
