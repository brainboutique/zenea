import { Injectable, signal, computed } from '@angular/core';

const STORAGE_KEY_REPO = 'zenea_repo';
const STORAGE_KEY_BRANCH = 'zenea_branch';
const STORAGE_KEY_HIDE_SENSITIVE = 'zenea_hide_sensitive';

/**
 * Persists and exposes the currently selected repository name and branch for API calls.
 * Used to build repo/branch-aware API paths and to display in the app header.
 */
@Injectable({ providedIn: 'root' })
export class UserConfigService {
  private readonly repoName = signal<string>(this.loadRepo());
  private readonly branch = signal<string>(this.loadBranch());
  private readonly hideSensitiveInformation = signal<boolean>(this.loadHideSensitive());

  readonly repoName$ = computed(() => this.repoName());
  readonly branch$ = computed(() => this.branch());
  readonly hideSensitiveInformation$ = computed(() => this.hideSensitiveInformation());

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

  private persist(repo: string, branch: string): void {
    if (typeof localStorage === 'undefined') return;
    if (repo) localStorage.setItem(STORAGE_KEY_REPO, repo);
    else localStorage.removeItem(STORAGE_KEY_REPO);
    if (branch) localStorage.setItem(STORAGE_KEY_BRANCH, branch);
    else localStorage.removeItem(STORAGE_KEY_BRANCH);
  }
}
