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

import { Component, inject, effect, ChangeDetectorRef, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { UserConfigService } from '../../services/user-config.service';
import { ConfigService } from '../../services/config.service';
import { AuthService } from '../../services/auth.service';
import { AuthorizationService } from '../../services/authorization.service';
import { SlurpLeanixDialogComponent, SlurpLeanixDialogData } from '../slurp-leanix-dialog/slurp-leanix-dialog.component';
import { SlurpLeanixProgressDialogComponent, SlurpLeanixProgressDialogData } from '../slurp-leanix-progress-dialog/slurp-leanix-progress-dialog.component';
import { GitMenuComponent } from '../git-menu/git-menu.component';
import { SettingsDialogComponent } from '../settings-dialog/settings-dialog.component';
import { GenerateSampledataDialogComponent } from '../generate-sampledata-dialog/generate-sampledata-dialog.component';
import { ManageUsersDialogComponent } from '../manage-users-dialog/manage-users-dialog.component';
import { SampleDataService } from '../../services/sample-data.service';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-admin-menu',
  standalone: true,
  imports: [CommonModule, MatMenuModule, MatButtonModule, MatDialogModule, MatSnackBarModule, GitMenuComponent, TranslateModule],
  templateUrl: './admin-menu.component.html',
  styleUrl: './admin-menu.component.scss',
})
export class AdminMenuComponent {
  onAdminTriggerClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  openMenu(trigger: MatMenuTrigger): void {
    trigger.openMenu();
  }

  closeMenu(trigger: MatMenuTrigger): void {
    trigger.closeMenu();
  }

  private dialog = inject(MatDialog);
  private sampleData = inject(SampleDataService);
  private userConfig = inject(UserConfigService);
  private configService = inject(ConfigService);
  private auth = inject(AuthService);
  private authorization = inject(AuthorizationService);
  private cdr = inject(ChangeDetectorRef);

  constructor() {
    this.authorization.fetchAuthorization();
    effect(() => {
      this.authorization.isAdmin();
      this.cdr.detectChanges();
    });
  }

  readonly canEdit = this.authorization.canEdit;
  readonly isAdmin = this.authorization.isAdmin;
  readonly authMode = this.authorization.authMode;

  readonly isSingleUserMode = computed(() => this.authMode() === '');

  readonly canManageUsers = computed(() => {
    const mode = this.authMode();
    return (mode === 'Local' || mode === 'Google') && this.isAdmin();
  });

  get loggedInEmail(): string | null {
    return this.auth.getEmail();
  }

  onLogout(): void {
    this.auth.logout();
    window.location.reload();
  }

  onSettings(): void {
    this.dialog.open(SettingsDialogComponent, {
      width: '420px',
    });
  }

  onGenerateSampledata(): void {
    this.sampleData.openGenerateSampleDataDialog();
  }

  onSlurpLeanix(): void {
    const repoName = this.userConfig.getRepoName()?.trim() || 'local';
    const branch = this.userConfig.getBranch()?.trim() || 'default';

    const ref = this.dialog.open(SlurpLeanixDialogComponent, {
      width: '420px',
      data: { repoName, branch } satisfies SlurpLeanixDialogData,
    });

    ref.afterClosed().subscribe((result: { baseUrl: string; bearerToken: string; cookies?: string; types?: string } | undefined) => {
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
        } satisfies SlurpLeanixProgressDialogData,
      });
    });
  }

  onManageUsers(): void {
    this.dialog.open(ManageUsersDialogComponent, {
      width: '80vw',
      maxWidth: '900px',
      height: '80vh',
      maxHeight: '80vh',
    });
  }

  onMenuOpened(): void {
    const mode = this.auth.getAuthMode();
    if (this.auth.hasValidSession() || mode === '' || mode === null) {
      this.authorization.fetchAuthorization();
    }
    this.cdr.detectChanges();
  }
}
