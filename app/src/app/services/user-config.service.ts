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

import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';

const STORAGE_KEY_REPO = 'zenea_repo';
const STORAGE_KEY_BRANCH = 'zenea_branch';
const STORAGE_KEY_HIDE_SENSITIVE = 'zenea_hide_sensitive';
const STORAGE_KEY_STACK_APPLICATIONS = 'zenea_stack_applications';

/**
 * Persists and exposes the currently selected repository name and branch for API calls.
 * Used to build repo/branch-aware API paths and to display in the app header.
 */
@Injectable({ providedIn: 'root' })
export class UserConfigService {
  private readonly repoName = signal<string>(this.loadRepo());
  private readonly branch = signal<string>(this.loadBranch());
  private readonly hideSensitiveInformation = signal<boolean>(this.loadHideSensitive());
  private readonly stackApplications = signal<boolean>(this.loadStackApplications());

  readonly repoName$ = computed(() => this.repoName());
  readonly branch$ = computed(() => this.branch());
  readonly hideSensitiveInformation$ = computed(() => this.hideSensitiveInformation());
  readonly stackApplications$ = computed(() => this.stackApplications());

  getRepoName(): string {
    return this.repoName();
  }

  getBranch(): string {
    return this.branch();
  }

  getHideSensitiveInformation(): boolean {
    return this.hideSensitiveInformation();
  }

  setHideSensitiveInformation(value: boolean): void {
    this.hideSensitiveInformation.set(value);
    this.persistHideSensitive(value);
  }

  getStackApplications(): boolean {
    return this.stackApplications();
  }

  setStackApplications(value: boolean): void {
    this.stackApplications.set(value);
    this.persistStackApplications(value);
  }

  /** Whether both repo and branch are set (so we can use repo/branch API paths). */
  hasRepoAndBranch(): boolean {
    const r = this.repoName().trim();
    const b = this.branch().trim();
    return r.length > 0 && b.length > 0;
  }

  setRepoBranch(repoName: string, branch: string): void {
    const r = (repoName ?? '').trim();
    const b = (branch ?? '').trim();
    this.repoName.set(r);
    this.branch.set(b);
    this.persist(r, b);
  }

  setFromCloneResponse(repoName: string, defaultBranch: string): void {
    this.setRepoBranch(repoName, defaultBranch);
  }

  private loadRepo(): string {
    if (typeof localStorage === 'undefined') return 'local';
    return localStorage.getItem(STORAGE_KEY_REPO) ?? 'local';
  }

  private loadBranch(): string {
    if (typeof localStorage === 'undefined') return 'default';
    return localStorage.getItem(STORAGE_KEY_BRANCH) ?? 'default';
  }

  private loadHideSensitive(): boolean {
    if (typeof localStorage === 'undefined') return false;
    const v = localStorage.getItem(STORAGE_KEY_HIDE_SENSITIVE);
    return v === 'true';
  }

  private persistHideSensitive(value: boolean): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_HIDE_SENSITIVE, value ? 'true' : 'false');
  }

  private loadStackApplications(): boolean {
    if (typeof localStorage === 'undefined') return false;
    const v = localStorage.getItem(STORAGE_KEY_STACK_APPLICATIONS);
    return v === 'true';
  }

  private persistStackApplications(value: boolean): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_STACK_APPLICATIONS, value ? 'true' : 'false');
  }

  private persist(repo: string, branch: string): void {
    if (typeof localStorage === 'undefined') return;
    if (repo) localStorage.setItem(STORAGE_KEY_REPO, repo);
    else localStorage.removeItem(STORAGE_KEY_REPO);
    if (branch) localStorage.setItem(STORAGE_KEY_BRANCH, branch);
    else localStorage.removeItem(STORAGE_KEY_BRANCH);
  }

  /** Build an absolute route array prefixed with current repo/branch. */
  projectUrl(segments: any[]): any[] {
    return ['/', this.repoName(), this.branch(), ...segments];
  }

  /** Build a URL string prefixed with current repo/branch (for returnUrl etc.). */
  projectUrlString(path: string): string {
    const repo = this.repoName();
    const branch = this.branch();
    const cleaned = path.startsWith('/') ? path.slice(1) : path;
    return `/${repo}/${branch}/${cleaned}`;
  }

  /** Navigate after branch switch: redirect to new repo/branch preserving path and query params. */
  navigateAfterBranchSwitch(router: Router, newRepo: string, newBranch: string): void {
    const urlTree = router.parseUrl(router.url);
    const segmentGroup = urlTree.root.children['primary'];
    const segments = segmentGroup?.segments ?? [];
    const queryParams = urlTree.queryParams;

    if (segments.length >= 2) {
      const pathSegments = segments.slice(2).map(s => s.path);
      router.navigate(['/', newRepo, newBranch, ...pathSegments], { queryParams });
    } else {
      router.navigate(['/', newRepo, newBranch, 'list', 'Applications'], { queryParams });
    }
  }
}
