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

import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { UserConfigService } from './user-config.service';

export interface AuthorizationState {
  repo: string;
  canRead: boolean;
  canEdit: boolean;
  isAdmin: boolean;
  allRepos: string[];
  authMode: string;
}

@Injectable({ providedIn: 'root' })
export class AuthorizationService {
  private http = inject(HttpClient);
  private userConfig = inject(UserConfigService);

  private readonly authState = signal<AuthorizationState | null>(null);
  private readonly loading = signal<boolean>(false);

  readonly canEdit = computed(() => this.authState()?.canEdit ?? false);
  readonly canRead = computed(() => this.authState()?.canRead ?? true);
  readonly isAdmin = computed(() => this.authState()?.isAdmin ?? false);
  readonly allRepos = computed(() => this.authState()?.allRepos ?? []);
  readonly isLoading = computed(() => this.loading());
  readonly authMode = computed(() => this.authState()?.authMode ?? '');

  fetchAuthorization(): void {
    const repoName = this.userConfig.getRepoName();
    const branch = this.userConfig.getBranch();

    this.loading.set(true);

    this.http
      .get<AuthorizationState>(`/api/v1/authorization?repoName=${encodeURIComponent(repoName)}&branch=${encodeURIComponent(branch)}`)
      .subscribe({
        next: (state) => {
          this.authState.set(state);
          this.loading.set(false);
        },
        error: () => {
          this.authState.set({
            repo: `${repoName}/${branch}`,
            canRead: true,
            canEdit: true,
            isAdmin: true,
            allRepos: [],
            authMode: '',
          });
          this.loading.set(false);
        },
      });
  }

  refreshOnRepoChange(): void {
    this.fetchAuthorization();
  }
}
