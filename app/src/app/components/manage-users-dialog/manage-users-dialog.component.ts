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
 * You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <https://www.gnu.org/>.
 */

import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MatDialog, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { HttpClient } from '@angular/common/http';
import { debounceTime, Subject } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { AuthorizationService } from '../../services/authorization.service';
import { TranslateModule } from '@ngx-translate/core';

interface User {
  username: string;
  access: boolean;
  role: string;
  read: string[];
  edit: string[];
}

interface Repository {
  repoName: string;
  branches: Array<{ name: string }>;
}

@Component({
  selector: 'app-manage-users-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatIconModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatCardModule,
    TranslateModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'Manage Users' | translate }}</h2>
    <mat-dialog-content class="manage-users-content">
      @if (loading()) {
        <div class="users-loading">
          <mat-spinner diameter="32"></mat-spinner>
        </div>
      } @else {
        <div class="users-header">
          @if (isLocalAuth()) {
            <button mat-raised-button color="primary" (click)="openNewUserDialog()">
              <mat-icon>add</mat-icon>
              {{ 'New User' | translate }}
            </button>
          }
        </div>

        @if (users().length === 0) {
          <p class="users-empty">{{ 'No users found.' | translate }}</p>
        } @else {
          <div class="users-list">
            @for (user of users(); track user.username) {
              <mat-card class="user-card">
                <mat-card-content>
                  <div class="user-row">
                    <div class="user-info">
                      <span class="user-username">{{ user.username }}</span>
                    </div>
                    <div class="user-actions">
                      <mat-checkbox
                        [checked]="user.role === 'admin'"
                        [disabled]="isCurrentUser(user.username)"
                        (change)="toggleAdmin(user, $event.checked)"
                      >
                        {{ 'Admin' | translate }}
                      </mat-checkbox>
                      <button
                        mat-button
                        color="primary"
                        (click)="generatePassword(user)"
                        [disabled]="savingPassword()"
                      >
                        <mat-icon>vpn_key</mat-icon>
                        {{ 'New Password' | translate }}
                      </button>
                    </div>
                  </div>

                  <div class="user-repos">
                    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="repo-select">
                      <mat-label>{{ 'Read' | translate }}</mat-label>
                      <mat-select
                        multiple
                        [ngModel]="user.read"
                        (ngModelChange)="updateRead(user, $event)"
                        (openedChange)="onSelectOpened($event)"
                      >
                        @if (reposLoading()) {
                          <mat-option disabled>
                            <mat-spinner diameter="20"></mat-spinner>
                          </mat-option>
                        }
                        @for (repo of allRepos(); track repo) {
                          <mat-option [value]="repo">{{ repo }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>

                    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="repo-select">
                      <mat-label>{{ 'Edit' | translate }}</mat-label>
                      <mat-select
                        multiple
                        [ngModel]="user.edit"
                        (ngModelChange)="updateEdit(user, $event)"
                        (openedChange)="onSelectOpened($event)"
                      >
                        @if (reposLoading()) {
                          <mat-option disabled>
                            <mat-spinner diameter="20"></mat-spinner>
                          </mat-option>
                        }
                        @for (repo of allRepos(); track repo) {
                          <mat-option [value]="repo">{{ repo }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                  </div>
                </mat-card-content>
              </mat-card>
            }
          </div>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'Close' | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .manage-users-content {
        min-width: 600px;
        max-width: 800px;
        max-height: 70vh;
      }
      .users-loading {
        display: flex;
        justify-content: center;
        padding: 40px;
      }
      .users-header {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 16px;
      }
      .users-empty {
        text-align: center;
        color: rgba(0, 0, 0, 0.6);
        padding: 20px;
      }
      .users-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .user-card {
        padding: 12px;
      }
      .user-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      .user-info {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .user-username {
        font-weight: 600;
        font-size: 1.1em;
      }
      .user-actions {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .user-repos {
        display: flex;
        gap: 12px;
      }
      .repo-select {
        flex: 1;
        min-width: 0;
      }
    `,
  ],
})
export class ManageUsersDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<ManageUsersDialogComponent>);
  private dialog = inject(MatDialog);
  private http = inject(HttpClient);
  private snackBar = inject(MatSnackBar);
  private auth = inject(AuthService);
  private authorization = inject(AuthorizationService);

  private saveSubject = new Subject<void>();

  loading = signal(true);
  reposLoading = signal(false);
  savingPassword = signal(false);
  users = signal<User[]>([]);
  allRepos = signal<string[]>([]);

  private currentUserEmail = signal<string>('');

  ngOnInit(): void {
    this.currentUserEmail.set(this.auth.getEmail() ?? '');
    this.loadData();

    this.saveSubject.pipe(debounceTime(500)).subscribe(() => {
      // Auto-save is handled inline after each change
    });
  }

  isLocalAuth(): boolean {
    return this.auth.getAuthMode() === 'Local';
  }

  isCurrentUser(username: string): boolean {
    return username.toLowerCase() === this.currentUserEmail().toLowerCase();
  }

  loadData(): void {
    this.loading.set(true);
    this.loadRepos();

    this.http.get<{ users: User[] }>('/api/v1/admin/users').subscribe({
      next: (res) => {
        this.users.set(res.users || []);
        this.loading.set(false);
      },
      error: () => {
        this.snackBar.open('Failed to load users', undefined, {
          duration: 3000,
          panelClass: ['snackbar-error'],
        });
        this.loading.set(false);
      },
    });
  }

  loadRepos(): void {
    if (this.allRepos().length > 0) return;
    this.reposLoading.set(true);

    this.http
      .get<{ repositories: Repository[] }>('/api/v1/git/branches')
      .subscribe({
        next: (res) => {
          const repos: string[] = [];
          if (res.repositories) {
            for (const repo of res.repositories) {
              for (const branch of repo.branches) {
                repos.push(`${repo.repoName}/${branch.name}`);
              }
            }
          }
          this.allRepos.set(repos);
          this.reposLoading.set(false);
        },
        error: () => {
          this.allRepos.set([]);
          this.reposLoading.set(false);
        },
      });
  }

  onSelectOpened(opened: boolean): void {
    if (opened) {
      this.loadRepos();
    }
  }

  toggleAdmin(user: User, isAdmin: boolean): void {
    if (this.isCurrentUser(user.username)) {
      this.snackBar.open('Cannot remove admin from yourself', undefined, {
        duration: 3000,
        panelClass: ['snackbar-error'],
      });
      this.loadData();
      return;
    }

    const newRole = isAdmin ? 'admin' : 'user';
    this.http
      .put(`/api/v1/admin/users/${encodeURIComponent(user.username)}`, {
        role: newRole,
      })
      .subscribe({
        next: () => {
          user.role = newRole;
          this.snackBar.open('User updated', undefined, {
            duration: 2000,
            panelClass: ['snackbar-success'],
          });
        },
        error: () => {
          this.snackBar.open('Failed to update user', undefined, {
            duration: 3000,
            panelClass: ['snackbar-error'],
          });
          this.loadData();
        },
      });
  }

  updateRead(user: User, read: string[]): void {
    user.read = read;
    this.saveUser(user);
  }

  updateEdit(user: User, edit: string[]): void {
    user.edit = edit;
    this.saveUser(user);
  }

  saveUser(user: User): void {
    this.http
      .put(`/api/v1/admin/users/${encodeURIComponent(user.username)}`, {
        role: user.role,
        read: user.read,
        edit: user.edit,
      })
      .subscribe({
        next: () => {
          // Silent save
        },
        error: () => {
          this.snackBar.open('Failed to save user', undefined, {
            duration: 3000,
            panelClass: ['snackbar-error'],
          });
        },
      });
  }

  generatePassword(user: User): void {
    this.savingPassword.set(true);
    this.http
      .post<{ password: string }>(
        `/api/v1/admin/users/${encodeURIComponent(user.username)}/password`,
        {}
      )
      .subscribe({
        next: (res) => {
          this.savingPassword.set(false);
          this.showPasswordDialog(user.username, res.password);
        },
        error: () => {
          this.savingPassword.set(false);
          this.snackBar.open('Failed to generate password', undefined, {
            duration: 3000,
            panelClass: ['snackbar-error'],
          });
        },
      });
  }

  showPasswordDialog(username: string, password: string): void {
    const dialogRef = this.dialog.open(PasswordDisplayDialogComponent, {
      width: '400px',
      data: { username, password },
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe(() => {
      // Password will not be shown again
    });
  }

  openNewUserDialog(): void {
    const dialogRef = this.dialog.open(NewUserDialogComponent, {
      width: '400px',
    });

    dialogRef.afterClosed().subscribe((username: string | undefined) => {
      if (username) {
        this.http
          .post<{ username: string; password: string }>(
            '/api/v1/admin/users',
            { username }
          )
          .subscribe({
            next: (res) => {
              this.snackBar.open('User created', undefined, {
                duration: 2000,
                panelClass: ['snackbar-success'],
              });
              this.showPasswordDialog(res.username, res.password);
              this.loadData();
            },
            error: () => {
              this.snackBar.open('Failed to create user', undefined, {
                duration: 3000,
                panelClass: ['snackbar-error'],
              });
            },
          });
      }
    });
  }
}

@Component({
  selector: 'app-password-display-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatTooltipModule,
    TranslateModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'New Password' | translate }}</h2>
    <mat-dialog-content>
      <p class="password-warning">{{ 'Please copy password, it will not be displayed again!' | translate }}</p>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="password-field">
        <mat-label>{{ 'Password' | translate }}</mat-label>
        <input matInput [value]="password" readonly />
        <button mat-icon-button matSuffix (click)="copyPassword()" [matTooltip]="'Copy' | translate">
          <mat-icon>content_copy</mat-icon>
        </button>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'Close' | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .password-warning {
        color: #c62828;
        font-weight: 500;
        margin-bottom: 12px;
        margin-top: 0;
      }
      .password-field {
        width: 100%;
      }
      mat-dialog-content {
        max-height: none;
        overflow: hidden;
      }
    `,
  ],
})
export class PasswordDisplayDialogComponent {
  private dialogRef = inject(MatDialogRef<PasswordDisplayDialogComponent>);
  private data = inject(MAT_DIALOG_DATA) as { username: string; password: string };

  get password(): string {
    return this.data.password;
  }

  copyPassword(): void {
    navigator.clipboard.writeText(this.data.password);
  }
}

@Component({
  selector: 'app-new-user-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    TranslateModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'New User' | translate }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="username-field">
        <mat-label>{{ 'Username' | translate }}</mat-label>
        <input matInput [(ngModel)]="username" (keydown.enter)="create()" />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'Cancel' | translate }}</button>
      <button mat-raised-button color="primary" [disabled]="!username || !username.trim()" (click)="create()">
        {{ 'Create User' | translate }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .username-field {
        width: 100%;
        padding-top: 8px;
      }
    `,
  ],
})
export class NewUserDialogComponent {
  constructor(private dialogRef: MatDialogRef<NewUserDialogComponent>) {}

  username = '';

  create(): void {
    if (this.username?.trim()) {
      this.dialogRef.close(this.username.trim());
    }
  }
}
