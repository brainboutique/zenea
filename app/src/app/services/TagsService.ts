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

import { Injectable, signal, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { UserConfigService } from './user-config.service';
import { catchError, of } from 'rxjs';

export interface TagItem {
  id: string;
  displayName: string;
  name: string;
  color: string | null;
  description: string | null;
  tagGroupId: string | null;
}

export interface TagGroupItem {
  id: string | null;
  displayName: string;
  name: string;
  shortName: string;
  description: string | null;
  mode: string | null;
  mandatory: boolean | null;
  tags: TagItem[];
}

@Injectable({ providedIn: 'root' })
export class TagsService {
  readonly data = signal<TagGroupItem[]>([]);
  readonly loading = signal<boolean>(false);

  private lastRepoBranchKey: string | null = null;

  constructor(
    private http: HttpClient,
    private userConfig: UserConfigService
  ) {
    effect(
      () => {
        const repo = this.userConfig.getRepoName().trim() || 'local';
        const branch = this.userConfig.getBranch().trim() || 'default';
        const key = `${repo}|${branch}`;
        if (this.lastRepoBranchKey === key) return;
        this.lastRepoBranchKey = key;
        this.data.set([]);
        this.load();
      }
    );
  }

  load(): void {
    const repo = this.userConfig.getRepoName().trim() || 'local';
    const branch = this.userConfig.getBranch().trim() || 'default';
    this.loading.set(true);
    this.http
      .get<TagGroupItem[]>(`/api/v1/${repo}/${branch}/tags`)
      .pipe(
        catchError(() => {
          this.loading.set(false);
          return of([]);
        })
      )
      .subscribe({
        next: (body) => {
          this.data.set(body ?? []);
          this.loading.set(false);
        },
        error: () => {
          this.data.set([]);
          this.loading.set(false);
        },
      });
  }

  getAllTags(): TagItem[] {
    const groups = this.data();
    const result: TagItem[] = [];
    for (const group of groups) {
      for (const tag of group.tags) {
        result.push({
          ...tag,
          tagGroupId: group.id,
        });
      }
    }
    return result;
  }

  getTagGroupById(id: string | null): TagGroupItem | null {
    return this.data().find((g) => g.id === id) ?? null;
  }

  getTagsByGroupId(groupId: string | null): TagItem[] {
    const group = this.getTagGroupById(groupId);
    if (!group) return [];
    return group.tags.map((tag) => ({
      ...tag,
      tagGroupId: group.id,
    }));
  }
}
