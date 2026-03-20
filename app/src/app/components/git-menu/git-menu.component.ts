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
      this.gitService.gitClone({ repositoryUrl }).subscribe({
        next: (result) => {
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
      this.gitService.gitCommitAndPushRepoBranch(repo, branch, body).subscribe({
        next: () => {
          this.snackBar.open(this.translate.instant('Commit and push succeeded.'), undefined, {
            duration: 3000,
            panelClass: ['snackbar-success'],
          });
        },
        error: (err) => {
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
