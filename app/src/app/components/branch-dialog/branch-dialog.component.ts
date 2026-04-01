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

import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { GitService } from '../../services/api/api/git.service';
import { EntityListRefreshService } from '../../services/entity-list-refresh.service';
import { UserConfigService } from '../../services/user-config.service';
import { ConfigService } from '../../services/config.service';
import { AuthorizationService } from '../../services/authorization.service';
import { CommitMessageDialogComponent } from '../commit-message-dialog/commit-message-dialog.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-branch-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatIconModule,
    MatCheckboxModule,
    TranslateModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'Manage Branches' | translate }}</h2>
    <mat-dialog-content class="branch-dialog-content">
      <p class="branch-dialog-section-label">{{ 'Switch to existing branches' | translate }}</p>
      @if (loading()) {
        <div class="branch-loading">
          <mat-spinner diameter="24"></mat-spinner>
          <span>{{ 'Loading branches…' | translate }}</span>
        </div>
      } @else if (repositories().length === 0) {
        <p class="branch-empty">{{ 'No repositories. Clone a repository first (Git → Clone).' | translate }}</p>
      } @else {
        @if (isAdmin()) {
          <mat-checkbox
            class="branch-set-default-checkbox"
            [(ngModel)]="setAsSystemDefault"
          >
            {{ 'Set as system default for all users' | translate }}
          </mat-checkbox>
        }
        @if (switching()) {
          <div class="branch-loading">
            <mat-spinner diameter="24"></mat-spinner>
            <span>{{ 'Checking out branch…' | translate }}</span>
          </div>
        }
        <div class="branch-tree" [class.branch-tree-dimmed]="switching()">
          @for (repo of repositories(); track repo.repoName) {
            <div class="branch-repo-group">
              <div class="branch-repo-name">{{ repo.repoName }}</div>
              @for (b of repo.branches; track b.name) {
                <div class="row">
                  <button
                    mat-button
                    class="branch-item branch-item-indent"
                    [class.branch-item-current]="isCurrent(repo.repoName, b.name)"
                    [disabled]="switching()"
                    (click)="switchBranch(repo.repoName, b.name, b.isCloned, b.isGitControlled)"
                  >
                    <span class="branch-item-label">{{ b.name }}</span>
                  </button>
                  <span class="branch-item-icons">
                    @if (b.isGitControlled) {
                      <mat-icon
                        class="branch-icon branch-icon-git-linked"
                        [title]="'GIT linked' | translate"
                      >
                        inventory
                      </mat-icon>
                    }
                    @if (b.isCloned) {
                      <mat-icon class="branch-icon branch-icon-synced" [title]="'Synced from GIT' | translate">offline_pin</mat-icon>
                    }
                    @if (b.hasUncommittedChanges) {
                      <mat-icon class="branch-icon branch-icon-uncommitted" [title]="'Contains uncommitted changes!' | translate">bolt</mat-icon>
                    }
                    @if (isDefaultRepoBranch(repo.repoName, b.name)) {
                      <mat-icon class="branch-icon branch-icon-default" [title]="'Default repo/branch' | translate">home</mat-icon>
                    }
                  </span>
                </div>
              }
            </div>
          }
        </div>
      }

      @if (!loading() && isAdmin()) {
        <p class="branch-dialog-section-label">{{ 'Create New Branch' | translate }}</p>
        @if (currentRepoName(); as repoName) {
          @if (isCurrentSelectionGitControlled()) {
            <p class="branch-current-repo">{{ 'Based on: {repo} / {branch}' | translate: { repo: repoName, branch: currentBranchName() ?? '—' } }}</p>
          } @else {
            <p class="branch-current-repo">{{ 'Create a new non-GIT-linked branch' | translate }}</p>
            @if (currentBranchName(); as baseBranch) {
              <mat-checkbox
                class="branch-copy-checkbox"
                [(ngModel)]="copyFromCurrent"
              >
                {{ 'Copy from {repo} / {branch}' | translate: { repo: repoName, branch: baseBranch } }}
              </mat-checkbox>
            }
          }
          @if (currentBranchHasUncommittedChanges()) {
            <div class="branch-uncommitted-warning">
              <p class="branch-uncommitted-message">{{ 'Your current branch has uncommitted changes. Please consider committing first!' | translate }}</p>
              <button mat-raised-button color="accent" (click)="openCommitDialog()">{{ 'Commit' | translate }}</button>
            </div>
          }
        } @else {
          <p class="branch-empty">{{ 'Select a repo/branch above to create a new branch there.' | translate }}</p>
        }
        <div class="branch-new-row">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="branch-input-field">
            <mat-label>{{ 'Branch name' | translate }}</mat-label>
            <input matInput [(ngModel)]="newBranchName" (keydown.enter)="switchToNewBranch()" />
          </mat-form-field>
          <button mat-raised-button color="primary" (click)="switchToNewBranch()">
            {{ 'New' | translate }}
          </button>
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'Close' | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .row {
        display: flex;
        white-space: nowrap;
      }
      .branch-dialog-content {
        min-width: 320px;
        max-width: 420px;
      }
      .branch-dialog-section-label {
        font-weight: 600;
        margin: 16px 0 8px 0;
        color: rgba(0, 0, 0, 0.7);
      }
      .branch-dialog-section-label:first-child {
        margin-top: 0;
      }
      .branch-loading {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 0;
        color: rgba(0, 0, 0, 0.7);
      }
      .branch-empty {
        color: rgba(0, 0, 0, 0.6);
        margin: 8px 0;
      }
      .branch-current-repo {
        font-size: 0.9em;
        color: rgba(0, 0, 0, 0.65);
        margin: 4px 0 8px 0;
      }
      .branch-uncommitted-warning {
        margin: 8px 0;
        padding: 10px 12px;
        background: rgba(255, 152, 0, 0.12);
        border-radius: 8px;
        border: 1px solid rgba(255, 152, 0, 0.35);
      }
      .branch-uncommitted-message {
        margin: 0 0 10px 0;
        font-size: 0.9em;
        color: rgba(0, 0, 0, 0.8);
      }
      .branch-tree {
        max-height: 280px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
      }
      .branch-tree-dimmed {
        opacity: 0.6;
        pointer-events: none;
      }
      .branch-repo-group {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .branch-repo-name {
        font-weight: 600;
        font-size: 0.95em;
        color: rgba(0, 0, 0, 0.8);
        padding: 4px 0 2px 0;
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
      }
      .branch-item {
        text-transform: none;
        display: flex;
        align-items: center;
        gap: 8px;
        justify-content: flex-start;
        text-align: left;
      }
      .branch-item-indent {
        padding-left: 16px;
      }
      .branch-item-label {
        flex-shrink: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .branch-item-icons {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }
      .branch-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        flex-shrink: 0;
      }
      .branch-icon-synced {
        color: #2e7d32;
      }
      .branch-icon-uncommitted {
        color: #c62828;
      }
      .branch-icon-default {
        color: #1565c0;
      }
      .branch-icon-git-linked {
        color: #1976d2;
      }
      .branch-item-current {
        font-weight: 700;
        color: var(--header-accent, #8dc63f);
        background: rgba(141, 198, 63, 0.12);
      }
      .branch-copy-checkbox {
        margin: 4px 0 8px 0;
      }
      .branch-set-default-checkbox {
        margin: 0 0 8px 0;
        display: block;
      }
      .branch-new-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }
      .branch-input-field {
        flex: 1;
        min-width: 0;
      }
    `,
  ],
})
export class BranchDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<BranchDialogComponent>);
  private dialog = inject(MatDialog);
  private gitService = inject(GitService);
  private snackBar = inject(MatSnackBar);
  private refreshService = inject(EntityListRefreshService);
  private userConfig = inject(UserConfigService);
  private configService = inject(ConfigService);
  private translate = inject(TranslateService);
  private authorization = inject(AuthorizationService);

  readonly isAdmin = this.authorization.isAdmin;

  /** Tree: repos with their branches (from API). */
  repositories = signal<
    Array<{
      repoName: string;
      branches: Array<{ name: string; isCloned?: boolean; hasUncommittedChanges?: boolean; isGitControlled?: boolean }>;
    }>
  >([]);
  /** Default repo/branch from server config (for home/synced icons). */
  defaultRepoName = signal<string>('');
  defaultBranchName = signal<string>('');
  currentSelection = signal<{ repoName: string; branch: string } | null>(null);
  /** True if the current branch (from /branches API) has uncommitted changes. */
  currentBranchHasUncommittedChanges = signal(false);
  loading = signal(true);
  /** True while checking out a not-yet-cloned branch via pull API. */
  switching = signal(false);
  newBranchName = '';
  /** Current repo for "Create New Branch" (from selection or user config). */
  currentRepoName = signal<string | null>(null);
  /** Current branch for "Create New Branch" and for basedOn when creating a new branch. */
  currentBranchName = signal<string | null>(null);
  /** Whether to copy .json files from the currently selected non-GIT branch when creating a new non-GIT-linked branch. */
  copyFromCurrent = true;
  /** Whether to update server-side default repo/branch in /data/.meta.json when switching branches. */
  setAsSystemDefault = false;

  ngOnInit(): void {
    this.loadBranches();
  }

  loadBranches(): void {
    this.loading.set(true);
    this.gitService.gitBranches().subscribe({
      next: (res) => {
        const { tree, selection, currentBranchHasUncommittedChanges: hasUncommitted, defaultRepo, defaultBranch } = this.parseBranchesResponse(res);
        this.repositories.set(tree);
        this.currentSelection.set(selection);
        this.currentBranchHasUncommittedChanges.set(hasUncommitted);
        this.defaultRepoName.set(defaultRepo);
        this.defaultBranchName.set(defaultBranch);
        const cur = this.userConfig.getRepoName()?.trim() ?? '';
        this.currentRepoName.set(cur || (tree.length > 0 ? tree[0].repoName : null));
        const curBranch = this.userConfig.getBranch()?.trim() ?? null;
        this.currentBranchName.set(curBranch || (selection?.branch ?? null));
        this.loading.set(false);
      },
      error: () => {
        this.repositories.set([]);
        this.currentSelection.set(null);
        this.currentBranchHasUncommittedChanges.set(false);
        this.defaultRepoName.set('');
        this.defaultBranchName.set('');
        this.currentRepoName.set(null);
        this.currentBranchName.set(null);
        this.loading.set(false);
      },
    });
  }

  /**
   * Parse GET /api/v1/git/branches into tree + selection + currentBranchHasUncommittedChanges + defaultRepo/defaultBranch.
   */
  private parseBranchesResponse(res: unknown): {
    tree: Array<{
      repoName: string;
      branches: Array<{ name: string; isCloned?: boolean; hasUncommittedChanges?: boolean; isGitControlled?: boolean }>;
    }>;
    selection: { repoName: string; branch: string } | null;
    currentBranchHasUncommittedChanges: boolean;
    defaultRepo: string;
    defaultBranch: string;
  } {
    const tree: Array<{
      repoName: string;
      branches: Array<{ name: string; isCloned?: boolean; hasUncommittedChanges?: boolean; isGitControlled?: boolean }>;
    }> = [];
    let selection: { repoName: string; branch: string } | null = null;
    let currentBranchHasUncommittedChanges = false;
    let defaultRepo = 'local';
    let defaultBranch = 'default';
    const currentRepo = this.userConfig.getRepoName()?.trim() ?? '';
    const currentBranchFromConfig = this.userConfig.getBranch()?.trim() ?? null;

    if (res && typeof res === 'object') {
      const obj = res as Record<string, unknown>;
      if (typeof obj['defaultRepo'] === 'string') defaultRepo = obj['defaultRepo'].trim() || defaultRepo;
      if (typeof obj['defaultBranch'] === 'string') defaultBranch = obj['defaultBranch'].trim() || defaultBranch;
    }

    if (res && typeof res === 'object' && 'repositories' in res) {
      const repos = (res as {
        repositories?: Array<{
          repoName?: string;
          branches?: Array<{ name?: string; isCloned?: boolean; hasUncommittedChanges?: boolean; isGitControlled?: boolean }>;
        }>;
      }).repositories;
      if (Array.isArray(repos)) {
        for (const repo of repos) {
          const repoName = (repo.repoName ?? '').trim();
          const branchObjs = Array.isArray(repo.branches) ? repo.branches : [];
          const branches: Array<{ name: string; isCloned?: boolean; hasUncommittedChanges?: boolean; isGitControlled?: boolean }> = [];
          for (const b of branchObjs) {
            const name = (b.name ?? '').trim();
            if (name) {
              branches.push({
                name,
                isCloned: b.isCloned,
                hasUncommittedChanges: b.hasUncommittedChanges,
                isGitControlled: b.isGitControlled,
              });
              if (repoName === currentRepo && name === currentBranchFromConfig) {
                selection = { repoName, branch: name };
                currentBranchHasUncommittedChanges = b.hasUncommittedChanges === true;
              }
            }
          }
          if (repoName) {
            tree.push({ repoName, branches });
          }
        }
      }
    }
    if (!selection && currentRepo && currentBranchFromConfig) {
      selection = { repoName: currentRepo, branch: currentBranchFromConfig };
    }
    return { tree, selection, currentBranchHasUncommittedChanges, defaultRepo, defaultBranch };
  }

  isDefaultRepoBranch(repoName: string, branchName: string): boolean {
    return this.defaultRepoName() === repoName && this.defaultBranchName() === branchName;
  }

  isCurrent(repoName: string, branchName: string): boolean {
    const s = this.currentSelection();
    return s !== null && s.repoName === repoName && s.branch === branchName;
  }

  isCurrentSelectionGitControlled(): boolean {
    const currentRepo = this.currentRepoName();
    const currentBranch = this.currentBranchName();
    if (!currentRepo || !currentBranch) return false;
    for (const repo of this.repositories()) {
      if (repo.repoName !== currentRepo) continue;
      for (const b of repo.branches) {
        if (b.name === currentBranch) {
          return b.isGitControlled === true;
        }
      }
    }
    return false;
  }

  switchBranch(repoName: string, branchName: string, isCloned?: boolean, isGitControlled?: boolean): void {
    if (!branchName?.trim() || !repoName?.trim()) return;
    const repo = repoName.trim();
    const branch = branchName.trim();
    this.currentRepoName.set(repo);
    this.currentBranchName.set(branch);

    const doSwitch = (): void => {
      const applyLocalSelection = (): void => {
        this.userConfig.setRepoBranch(repo, branch);
        this.refreshService.triggerShowLoading();
        this.dialogRef.close();
        this.snackBar.open(this.translate.instant('Switched to {repo} / {branch}', { repo, branch }), undefined, {
          duration: 3000,
          panelClass: ['snackbar-success'],
        });
        this.refreshService.triggerRefresh();
      };

      if (!this.setAsSystemDefault) {
        applyLocalSelection();
        return;
      }

      this.configService.updateConfig(repo, branch).subscribe({
        next: () => {
          applyLocalSelection();
        },
        error: (err) => {
          this.snackBar.open(err?.message ?? this.translate.instant('Failed to set system default.'), undefined, {
            duration: 5000,
            panelClass: ['snackbar-error'],
          });
          applyLocalSelection();
        },
      });
    };

    if (isGitControlled === false) {
      doSwitch();
      return;
    }

    if (isCloned === false) {
      this.switching.set(true);
      this.gitService.gitPull(repo, branch).subscribe({
        next: (res) => {
          if (res?.success === false) {
            this.snackBar.open(res.message ?? this.translate.instant('Checkout failed.'), undefined, {
              duration: 5000,
              panelClass: ['snackbar-error'],
            });
            this.switching.set(false);
            return;
          }
          doSwitch();
        },
        error: (err) => {
          this.snackBar.open(err?.message ?? this.translate.instant('Checkout failed.'), undefined, {
            duration: 5000,
            panelClass: ['snackbar-error'],
          });
          this.switching.set(false);
        },
      });
    } else {
      doSwitch();
    }
  }

  switchToNewBranch(): void {
    const name = this.newBranchName?.trim();
    if (!name) return;
    const repo = this.currentRepoName() ?? this.userConfig.getRepoName()?.trim() ?? '';
    if (!repo) return;
    const basedOn = this.isCurrentSelectionGitControlled()
      ? this.currentBranchName() ?? this.userConfig.getBranch()?.trim() ?? undefined
      : this.copyFromCurrent
      ? this.currentBranchName() ?? undefined
      : undefined;
    this.switchBranchWithBasedOn(repo, name, basedOn);
    this.newBranchName = '';
  }

  /** Switch to or create a branch, passing basedOn when the branch is not yet cloned (for new branch creation). */
  private switchBranchWithBasedOn(repo: string, branch: string, basedOn: string | undefined): void {
    const doSwitch = (): void => {
      this.userConfig.setRepoBranch(repo, branch);
      this.snackBar.open(this.translate.instant('Switched to {repo} / {branch}', { repo, branch }), undefined, {
        duration: 3000,
        panelClass: ['snackbar-success'],
      });
      this.refreshService.triggerRefresh();
    };

    const isCloned = this.repositories().some(
      (r) => r.repoName === repo && r.branches.some((b) => b.name === branch && b.isCloned)
    );
    if (isCloned) {
      this.userConfig.setRepoBranch(repo, branch);
      this.refreshService.triggerShowLoading();
      this.dialogRef.close();
      this.snackBar.open(this.translate.instant('Switched to {repo} / {branch}', { repo, branch }), undefined, {
        duration: 3000,
        panelClass: ['snackbar-success'],
      });
      this.refreshService.triggerRefresh();
      return;
    }
    // New branch: close dialog immediately and show loading until branch creation + entity reload complete.
    this.dialogRef.close();
    this.refreshService.triggerShowLoading();
    this.gitService.gitPull(repo, branch, basedOn).subscribe({
      next: (res) => {
        if (res?.success === false) {
          this.snackBar.open(res.message ?? this.translate.instant('Checkout failed.'), undefined, {
            duration: 5000,
            panelClass: ['snackbar-error'],
          });
          this.refreshService.triggerRefresh();
          return;
        }
        doSwitch();
      },
      error: (err) => {
        this.snackBar.open(err?.message ?? this.translate.instant('Checkout failed.'), undefined, {
          duration: 5000,
          panelClass: ['snackbar-error'],
        });
        this.refreshService.triggerRefresh();
      },
    });
  }

  openCommitDialog(): void {
    const ref = this.dialog.open(CommitMessageDialogComponent, {
      width: '400px',
      data: {},
    });
    ref.afterClosed().subscribe((message: string | undefined) => {
      if (message === undefined) return;
      this.loading.set(true);
      this.repositories.set([]);
      const repo = this.currentRepoName() ?? this.userConfig.getRepoName()?.trim() ?? 'local';
      const branch = this.userConfig.getBranch()?.trim() ?? 'default';
      const body = { message: message || undefined };
      this.gitService.gitCommitAndPushRepoBranch(repo, branch, body).subscribe({
        next: () => {
          this.snackBar.open(this.translate.instant('Commit and push succeeded.'), undefined, {
            duration: 3000,
            panelClass: ['snackbar-success'],
          });
          this.loadBranches();
        },
        error: (err) => {
          this.snackBar.open(err?.message ?? this.translate.instant('Commit failed.'), undefined, {
            duration: 5000,
            panelClass: ['snackbar-error'],
          });
          this.loadBranches();
        },
      });
    });
  }
}
