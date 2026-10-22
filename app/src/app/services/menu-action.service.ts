import { Injectable, computed, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router, UrlTree } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CdkMenuTrigger } from '@angular/cdk/menu';
import { InputModalityDetector } from '@angular/cdk/a11y';
import { filter } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { APP_MENU, MenuItem } from '../menu/menu.config';
import { UserConfigService } from './user-config.service';
import { AuthService } from './auth.service';
import { AuthorizationService } from './authorization.service';
import { SampleDataService } from './sample-data.service';
import { LoadingOverlayService } from './loading-overlay.service';
import { EntityListRefreshService } from './entity-list-refresh.service';
import { GitService } from './api/api/git.service';
import { SettingsDialogComponent } from '../components/settings-dialog/settings-dialog.component';
import { ManageUsersDialogComponent } from '../components/manage-users-dialog/manage-users-dialog.component';
import { ManageRolesDialogComponent } from '../components/manage-roles-dialog/manage-roles-dialog.component';
import { BranchDialogComponent } from '../components/branch-dialog/branch-dialog.component';
import { CloneDialogComponent } from '../components/clone-dialog/clone-dialog.component';
import { CommitMessageDialogComponent } from '../components/commit-message-dialog/commit-message-dialog.component';
import { SlurpLeanixDialogComponent, SlurpLeanixDialogData } from '../components/slurp-leanix-dialog/slurp-leanix-dialog.component';
import { SlurpLeanixProgressDialogComponent, SlurpLeanixProgressDialogData } from '../components/slurp-leanix-progress-dialog/slurp-leanix-progress-dialog.component';

@Injectable({ providedIn: 'root' })
export class MenuActionService {
  readonly roots: MenuItem[] = APP_MENU;

  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);
  private userConfig = inject(UserConfigService);
  private auth = inject(AuthService);
  private authorization = inject(AuthorizationService);
  private sampleData = inject(SampleDataService);
  private gitService = inject(GitService);
  private refreshService = inject(EntityListRefreshService);
  private loadingOverlay = inject(LoadingOverlayService);
  private modality = inject(InputModalityDetector);
  private platformId = inject(PLATFORM_ID);

  private readonly currentUrl = signal(this.router.url);

  private readonly hoverCapableSignal = signal(true);
  readonly hoverCapable = this.hoverCapableSignal.asReadonly();

  private hoverTrigger: CdkMenuTrigger | null = null;
  private openedTrigger: CdkMenuTrigger | null = null;
  private hoverCloseTimeout: ReturnType<typeof setTimeout> | null = null;
  private static readonly HOVER_CLOSE_DELAY_MS = 250;

  private readonly activeIds = computed(() => {
    const ids = new Set<string>();
    const current = this.router.parseUrl(this.currentUrl());
    const walk = (items: MenuItem[]): void => {
      let winner: MenuItem[] = [];
      let winnerScore = -1;
      for (const item of items) {
        if (this.hasChildren(item) || !this.matchesRoute(item, current)) continue;
        const score = Object.keys(item.route?.queryParams ?? {}).length;
        if (score > winnerScore) {
          winnerScore = score;
          winner = [item];
        } else if (score === winnerScore) {
          winner.push(item);
        }
      }
      for (const item of winner) ids.add(item.id);
      for (const item of items) {
        if (this.hasChildren(item)) walk(this.childrenOf(item));
      }
    };
    walk(this.roots);
    return ids;
  });

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects);
        this.openedTrigger?.close();
        this.openedTrigger = null;
      });

    if (isPlatformBrowser(this.platformId)) {
      const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
      this.hoverCapableSignal.set(mediaQuery.matches);
      mediaQuery.addEventListener('change', (event: MediaQueryListEvent) =>
        this.hoverCapableSignal.set(event.matches),
      );
    }
  }

  rememberTrigger(trigger: CdkMenuTrigger): void {
    this.openedTrigger = trigger;
  }

  visibleItems(items: MenuItem[]): MenuItem[] {
    return items
      .map((item) => (item.children ? { ...item, children: this.visibleItems(item.children) } : item))
      .filter((item) => this.isVisible(item) && (!item.children || item.children.length > 0));
  }

  hasChildren(item: MenuItem): boolean {
    return !!item.children?.length;
  }

  childrenOf(item: MenuItem): MenuItem[] {
    return item.children ?? [];
  }

  link(item: MenuItem): any[] {
    const route = item.route;
    if (!route) return [];
    return route.absolute ? ['/'] : this.userConfig.projectUrl(route.segments);
  }

  queryParams(item: MenuItem): Record<string, string> | undefined {
    return item.route?.queryParams;
  }

  isActive(item: MenuItem): boolean {
    if (this.hasChildren(item)) {
      return this.childrenOf(item).some((child) => this.isActive(child));
    }
    return this.activeIds().has(item.id);
  }

  openOnHover(trigger: CdkMenuTrigger): void {
    if (this.modality.mostRecentModality === 'touch') return;
    this.cancelHoverClose();
    this.hoverTrigger = trigger;
    trigger.open();
  }

  hoverEntered(): void {
    this.cancelHoverClose();
  }

  hoverLeft(): void {
    if (this.modality.mostRecentModality === 'touch') return;
    this.cancelHoverClose();
    this.hoverCloseTimeout = setTimeout(() => {
      this.hoverCloseTimeout = null;
      this.hoverTrigger?.close();
      this.hoverTrigger = null;
    }, MenuActionService.HOVER_CLOSE_DELAY_MS);
  }

  private cancelHoverClose(): void {
    if (this.hoverCloseTimeout != null) {
      clearTimeout(this.hoverCloseTimeout);
      this.hoverCloseTimeout = null;
    }
  }

  private matchesRoute(item: MenuItem, current: UrlTree): boolean {
    const route = item.route;
    if (!route) return false;
    const currentPath = this.router.serializeUrl(current).replace(/[?#].*$/, '');
    const targetPath = this.router.serializeUrl(this.router.createUrlTree(this.link(item)));
    const pathMatches = route.exact
      ? currentPath === targetPath
      : currentPath === targetPath || currentPath.startsWith(targetPath.endsWith('/') ? targetPath : targetPath + '/');
    if (!pathMatches) return false;
    for (const [key, value] of Object.entries(route.queryParams ?? {})) {
      if (current.queryParamMap.get(key) !== value) return false;
    }
    return true;
  }

  run(item: MenuItem): void {
    switch (item.action) {
      case 'git-branches':
        this.openBranchDialog();
        break;
      case 'git-clone':
        this.openCloneDialog();
        break;
      case 'git-commit':
        this.openCommitDialog();
        break;
      case 'git-pull':
        this.pull();
        break;
      case 'settings':
        this.dialog.open(SettingsDialogComponent, { width: '420px' });
        break;
      case 'sample-data':
        this.sampleData.openGenerateSampleDataDialog();
        break;
      case 'slurp-leanix':
        this.slurpLeanix();
        break;
      case 'manage-users':
        this.dialog.open(ManageUsersDialogComponent, {
          width: '80vw',
          maxWidth: '900px',
          height: '80vh',
          maxHeight: '80vh',
        });
        break;
      case 'manage-roles':
        this.dialog.open(ManageRolesDialogComponent, {
          width: '80vw',
          maxWidth: '900px',
          height: '80vh',
          maxHeight: '80vh',
        });
        break;
      case 'logout':
        this.auth.logout();
        window.location.reload();
        break;
      default:
        break;
    }
  }

  refreshAuthorization(): void {
    const mode = this.auth.getAuthMode();
    if (this.auth.hasValidSession() || mode === '' || mode === null) {
      this.authorization.fetchAuthorization();
    }
  }

  private isVisible(item: MenuItem): boolean {
    switch (item.visible) {
      case undefined:
        return true;
      case 'canEdit':
        return this.authorization.canEdit();
      case 'adminOrSingleUser':
        return this.authorization.isAdmin() || this.authorization.authMode() === '';
      case 'canManageUsers': {
        const mode = this.authorization.authMode();
        return (mode === 'Local' || mode === 'Google') && this.authorization.isAdmin();
      }
      case 'loggedIn':
        return this.auth.hasValidSession$() && this.auth.getEmail() != null;
      default:
        return true;
    }
  }

  private openBranchDialog(): void {
    this.dialog.open(BranchDialogComponent, { width: '420px' });
  }

  private openCloneDialog(): void {
    const ref = this.dialog.open(CloneDialogComponent, { width: '520px' });
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

  private openCommitDialog(): void {
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

  private pull(): void {
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

  private slurpLeanix(): void {
    const repoName = this.userConfig.getRepoName()?.trim() || 'local';
    const branch = this.userConfig.getBranch()?.trim() || 'default';
    const ref = this.dialog.open(SlurpLeanixDialogComponent, {
      width: '560px',
      data: { repoName, branch } satisfies SlurpLeanixDialogData,
    });
    ref.afterClosed().subscribe((result) => {
      if (!result?.baseUrl || !result?.bearerToken) return;
      this.dialog.open(SlurpLeanixProgressDialogComponent, {
        width: '400px',
        disableClose: true,
        data: {
          baseUrl: result.baseUrl,
          bearerToken: result.bearerToken,
          cookies: (result.cookies ?? '').trim(),
          repoName,
          branch,
          types: result.types,
          autoRemoveDeleted: result.autoRemoveDeleted,
          ignoreAttributes: result.ignoreAttributes,
        } satisfies SlurpLeanixProgressDialogData,
      });
    });
  }
}
