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

import {
  Component,
  input,
  output,
  signal,
  computed,
  inject,
  effect,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { FormsModule } from '@angular/forms';
import { TagsService, TagGroupItem, TagItem } from '../../services/TagsService';
import { TranslateModule } from '@ngx-translate/core';

export interface TagForEditor {
  id: string;
  name: string;
  color?: string | null;
  description?: string | null;
}

@Component({
  selector: 'app-tags-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    TranslateModule,
  ],
  template: `
    <div class="tags-editor">
      @for (tag of tagList(); track tag.id) {
        <div class="tag-pill" [style.backgroundColor]="tag.color ?? '#999'" [style.color]="getTextColor(tag.color)">
          <span class="tag-label">{{ tag.name }}</span>
          @if (!readOnly()) {
            <button mat-icon-button class="tag-remove-btn" (click)="removeTag(tag)" [attr.aria-label]="'Remove tag' | translate">
              <mat-icon>close</mat-icon>
            </button>
          }
        </div>
      }
      @if (!readOnly()) {
        <button mat-stroked-button #tagGroupBtn="matMenuTrigger" [matMenuTriggerFor]="tagGroupMenu">
          <mat-icon>add</mat-icon>
          Tag
        </button>
      }
    </div>

    <mat-menu #tagGroupMenu="matMenu" class="tag-group-menu">
      @for (group of tagGroups(); track group.id) {
        <button mat-menu-item [matMenuTriggerFor]="tagMenu">
          <span>{{ group.displayName }}</span>
        </button>
        <mat-menu #tagMenu="matMenu" class="tag-menu">
          @for (tag of group.tags; track tag.id) {
            <button mat-menu-item (click)="addTag(tag)">
              <span [style.color]="tag.color ?? undefined">{{ tag.displayName }}</span>
            </button>
          }
        </mat-menu>
      }
    </mat-menu>
  `,
  styles: [`
    .tags-editor {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .tag-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
      color: #fff;
    }
    .tag-label {
      line-height: 1;
    }
    .tag-remove-btn {
      width: 16px;
      height: 16px;
      line-height: 16px;
      padding: 0;
      min-width: 16px;
      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
        line-height: 14px;
      }
    }
    .add-tag-btn {
      font-size: 12px;
      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        margin-right: 4px;
      }
    }
  `],
})
export class TagsEditorComponent {
  private tagsService = inject(TagsService);

  /** Current tags assigned to the entity. */
  tags = input.required<TagForEditor[]>();

  /** If true, disable editing. */
  readOnly = input<boolean>(false);

  /** Emitted when tags change (add or remove). */
  tagsChange = output<TagForEditor[]>();

  /** Local copy of tags that updates when input changes. */
  protected tagList = signal<TagForEditor[]>([]);

  private tagsEffect = effect(() => {
    this.tagList.set(this.tags());
  });

  /** Available tag groups with their tags. */
  tagGroups = computed(() => this.tagsService.data());

  /** Get contrasting text color for a background. */
  getTextColor(bgColor: string | null | undefined): string {
    if (!bgColor) return '#fff';
    const r = parseInt(bgColor.slice(1, 3), 16);
    const g = parseInt(bgColor.slice(3, 5), 16);
    const b = parseInt(bgColor.slice(5, 7), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#000' : '#fff';
  }

  addTag(tag: TagItem): void {
    const current = [...this.tags()];
    if (current.some(t => t.id === tag.id)) return;
    current.push({
      id: tag.id,
      name: tag.displayName,
      color: tag.color,
      description: tag.description,
    });
    this.tagList.set(current);
    this.tagsChange.emit(current);
  }

  removeTag(tagToRemove: TagForEditor): void {
    const current = this.tags().filter(t => t.id !== tagToRemove.id);
    this.tagsChange.emit(current);
  }
}
