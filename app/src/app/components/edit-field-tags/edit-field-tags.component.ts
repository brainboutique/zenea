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
import { TranslateModule } from '@ngx-translate/core';
import { TagsEditorComponent, TagForEditor } from '../tags-editor/tags-editor.component';

@Component({
  selector: 'app-edit-field-tags',
  standalone: true,
  imports: [CommonModule, TranslateModule, TagsEditorComponent],
  template: `
    <div class="form-field-like">
      <span class="mat-label">{{ label() | translate }}</span>
      <div class="pills-field">
        <app-tags-editor
          [tags]="tagsForEditor()"
          [readOnly]="readOnly()"
          (tagsChange)="onTagsChange($event)"
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
    .pills-field {
      padding: 0.5rem 0;
    }
  `],
})
export class EditFieldTagsComponent {
  data = input.required<Record<string, unknown>>();
  field = input.required<string>();
  label = input.required<string>();
  readOnly = input<boolean>(false);
  onMutated = input<() => void>(() => {});

  private version = signal(0);

  tagsForEditor = computed((): TagForEditor[] => {
    this.version();
    const d = this.data();
    const field = this.field();
    const raw = d?.[field];
    if (!Array.isArray(raw)) return [];
    return raw.map((t: Record<string, unknown>) => ({
      id: String(t['id'] ?? ''),
      name: String(t['name'] ?? t['label'] ?? t['description'] ?? '—'),
      color: typeof t['color'] === 'string' ? t['color'] : undefined,
      description: typeof t['description'] === 'string' ? t['description'] : undefined,
    })).filter(t => t.id !== '');
  });

  onTagsChange(newTags: TagForEditor[]): void {
    if (this.readOnly()) return;
    const d = this.data();
    const field = this.field();
    if (!d || !field) return;
    d[field] = newTags.map(t => ({
      id: t.id,
      name: t.name,
      color: t.color ?? undefined,
      description: t.description ?? undefined,
    }));
    this.version.update(v => v + 1);
    this.onMutated()?.();
  }
}
