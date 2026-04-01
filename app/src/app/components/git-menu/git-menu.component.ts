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
  inject,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { GitService } from '../../services/api/api/git.service';
import { EntityListRefreshService } from '../../services/entity-list-refresh.service';
import { UserConfigService } from '../../services/user-config.service';
import { CommitMessageDialogComponent } from '../commit-message-dialog/commit-message-dialog.component';
import { BranchDialogComponent } from '../branch-dialog/branch-dialog.component';
import { CloneDialogComponent } from '../clone-dialog/clone-dialog.component';
import { TranslateService } from '@ngx-translate/core';
import { LoadingOverlayService } from '../../services/loading-overlay.service';

@Component({
  selector: 'app-git-menu',
  standalone: true,
  imports: [CommonModule, MatMenuModule, MatButtonModule, MatDialogModule, MatSnackBarModule],
  templateUrl: './git-menu.component.html',
  styleUrl: './git-menu.component.scss',
})
export class GitMenuComponent {
  openMenu(trigger: MatMenuTrigger) {
    trigger.openMenu();
  }
  closeMenu(trigger: MatMenuTrigger) {
    trigger.closeMenu();
  }

  private gitService = inject(GitService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private refreshService = inject(EntityListRefreshService);
  private userConfig = inject(UserConfigService);
  private translate = inject(TranslateService);
  private loadingOverlay = inject(LoadingOverlayService);

  openBranchDialog(): void {
    this.dialog.open(BranchDialogComponent, {
      width: '420px',
    });
  }

  openCloneDialog(): void {
    const ref = this.dialog.open(CloneDialogComponent, {
      width: '520px',
    });
    ref.afterClosed().subscribe((repositoryUrl: string | undefined) => {
      if (!repositoryUrl) return;
      this.loadingOverlay.show();
      this.gitService.gitClone({ repositoryUrl }).subscribe({
        next: (result) => {
          this.loadingOverlay.hide();
          if (result?.success === false) {
            this.snackBar.open(result.message || this.translate.instant('Clone failed.'), undefined, {
              duration: 5000,
              panelClass: ['snackbar-error'],
            });
            return;
          }
          const res = result as { repoName?: string; defaultBranch?: string };
          if (res?.repoName && res?.defaultBranch) {
            this.userConfig.setFromCloneResponse(res.repoName, res.defaultBranch);
            this.refreshService.triggerRefresh();
          }
          this.snackBar.open(this.translate.instant('Clone completed.'), undefined, {
            duration: 3000,
            panelClass: ['snackbar-success'],
          });
        },
        error: (err) => {
          this.loadingOverlay.hide();
          this.snackBar.open(err?.message ?? this.translate.instant('Clone failed.'), undefined, {
            duration: 5000,
            panelClass: ['snackbar-error'],
          });
        },
      });
    });
  }

  openCommitDialog(): void {
    const ref = this.dialog.open(CommitMessageDialogComponent, {
      width: '400px',
      data: {},
    });
    ref.afterClosed().subscribe((message: string | undefined) => {
      if (message === undefined) return;
      const repo = this.userConfig.getRepoName().trim() || 'default';
      const branch = this.userConfig.getBranch().trim() || 'default';
      const body = { message: message || undefined };
      this.loadingOverlay.show();
      this.gitService.gitCommitAndPushRepoBranch(repo, branch, body).subscribe({
        next: () => {
          this.loadingOverlay.hide();
          this.snackBar.open(this.translate.instant('Commit and push succeeded.'), undefined, {
            duration: 3000,
            panelClass: ['snackbar-success'],
          });
        },
        error: (err) => {
          this.loadingOverlay.hide();
          this.snackBar.open(err?.message ?? this.translate.instant('Commit failed.'), undefined, {
            duration: 5000,
            panelClass: ['snackbar-error'],
          });
        },
      });
    });
  }

  onPull(): void {
    const repo = this.userConfig.getRepoName().trim() || 'default';
    const branch = this.userConfig.getBranch().trim() || 'default';
    this.refreshService.triggerShowLoading();
    this.gitService.gitPull(repo, branch).subscribe({
      next: () => {
        this.snackBar.open(this.translate.instant('Pull succeeded.'), undefined, {
          duration: 3000,
          panelClass: ['snackbar-success'],
        });
        this.refreshService.triggerRefresh();
      },
      error: (err) => {
        this.snackBar.open(err?.message ?? this.translate.instant('Pull failed.'), undefined, {
          duration: 5000,
          panelClass: ['snackbar-error'],
        });
        this.refreshService.triggerRefresh();
      },
    });
  }
}
