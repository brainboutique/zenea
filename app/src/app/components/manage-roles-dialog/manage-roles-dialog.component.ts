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

import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Subject, Subscription, debounceTime } from 'rxjs';

export interface RoleRule {
  entity?: string;
  attribute?: string;
  permission: 'read' | 'write' | 'none';
}

export interface RoleData {
  name: string;
  rules: RoleRule[];
}

@Component({
  selector: 'app-manage-roles-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatExpansionModule,
    MatSnackBarModule,
    TranslateModule,
    DragDropModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'Manage Roles' | translate }}</h2>
    <mat-dialog-content class="roles-content">
      @if (loading()) {
        <div class="roles-loading">{{ 'Loading...' | translate }}</div>
      } @else {
        <div class="roles-header">
          <button mat-raised-button color="primary" (click)="addRole()">
            <mat-icon>add</mat-icon>
            {{ 'Add Role' | translate }}
          </button>
        </div>

        @if (roles().length === 0) {
          <p class="roles-empty">{{ 'No roles defined. Create a role to define fine-grained attribute permissions.' | translate }}</p>
        } @else {
          <mat-accordion multi>
            @for (role of roles(); track role.name) {
              <mat-expansion-panel>
                <mat-expansion-panel-header>
                  <mat-panel-title>
                    <span class="role-name">{{ role.name }}</span>
                    <span class="role-rule-count">{{ role.rules.length }} {{ 'rules' | translate }}</span>
                  </mat-panel-title>
                </mat-expansion-panel-header>

                <div
                  cdkDropList
                  [cdkDropListData]="role.rules"
                  (cdkDropListDropped)="onDrop(role, $event)"
                  class="rules-table"
                >
                  <div class="rules-header">
                    <span class="col-drag"></span>
                    <span class="col-entity">{{ 'Entity' | translate }}</span>
                    <span class="col-attribute">{{ 'Attribute (regexp)' | translate }}</span>
                    <span class="col-permission">{{ 'Permission' | translate }}</span>
                    <span class="col-actions"></span>
                  </div>

                  @for (rule of role.rules; track $index; let i = $index) {
                    @if (i < role.rules.length - 1) {
                    <div class="rule-row" cdkDrag>
                      <span class="col-drag drag-handle" cdkDragHandle>
                        <mat-icon>drag_indicator</mat-icon>
                      </span>

                      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="col-entity">
                        <mat-select
                          [ngModel]="rule.entity ?? ''"
                          (ngModelChange)="rule.entity = $event || undefined; debouncedSave(role)"
                        >
                          <mat-option [value]="''">{{ 'Any' | translate }}</mat-option>
                          @for (et of entityTypes(); track et) {
                            <mat-option [value]="et">{{ et }}</mat-option>
                          }
                        </mat-select>
                      </mat-form-field>

                      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="col-attribute">
                        <input matInput
                          [ngModel]="rule.attribute ?? ''"
                          (ngModelChange)="rule.attribute = $event || undefined; debouncedSave(role)"
                          placeholder="{{ 'e.g. displayName, .*rel' | translate }}"
                        />
                      </mat-form-field>

                      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="col-permission">
                        <mat-select
                          [ngModel]="rule.permission"
                          (ngModelChange)="rule.permission = $event; debouncedSave(role)"
                        >
                          <mat-option value="read">{{ 'Read' | translate }}</mat-option>
                          <mat-option value="write">{{ 'Write' | translate }}</mat-option>
                          <mat-option value="none">{{ 'None' | translate }}</mat-option>
                        </mat-select>
                      </mat-form-field>

                      <button mat-icon-button color="warn" (click)="removeRule(role, i)" class="col-actions">
                        <mat-icon>close</mat-icon>
                      </button>
                    </div>
                    }
                  }

                  <button mat-button color="primary" (click)="addRule(role)" class="add-rule-inline">
                    <mat-icon>add</mat-icon>
                    {{ 'Add Rule' | translate }}
                  </button>

                  <div class="rule-row default-rule">
                    <span class="col-drag"></span>
                    <span class="col-entity default-label">{{ 'Default' | translate }}</span>
                    <span class="col-attribute default-hint">{{ 'Catch-all for unmatched attributes' | translate }}</span>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="col-permission">
                      <mat-select
                        [ngModel]="defaultPermission(role)"
                        (ngModelChange)="setDefaultPermission(role, $event)"
                      >
                        <mat-option value="read">{{ 'Read' | translate }}</mat-option>
                        <mat-option value="write">{{ 'Write' | translate }}</mat-option>
                        <mat-option value="none">{{ 'None' | translate }}</mat-option>
                      </mat-select>
                    </mat-form-field>
                    <span class="col-actions"></span>
                  </div>
                </div>

                <div class="rules-actions">
                  <button mat-button color="warn" (click)="deleteRole(role)">
                    <mat-icon>delete</mat-icon>
                    {{ 'Delete Role' | translate }}
                  </button>
                </div>
              </mat-expansion-panel>
            }
          </mat-accordion>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'Close' | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .roles-content {
      min-width: 700px;
      max-width: 900px;
      max-height: 70vh;
    }
    .roles-loading {
      text-align: center;
      padding: 40px;
    }
    .roles-header {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 16px;
    }
    .roles-empty {
      text-align: center;
      color: rgba(0, 0, 0, 0.6);
      padding: 20px;
    }
    .role-name {
      font-weight: 600;
      font-size: 1em;
      flex: 1;
    }
    .role-rule-count {
      font-size: 0.85em;
      color: rgba(0, 0, 0, 0.5);
      margin-left: 12px;
    }
    .rules-table {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
    }
    .rules-header {
      display: flex;
      gap: 8px;
      padding: 0 4px;
      font-size: 0.75rem;
      font-weight: 600;
      color: rgba(0, 0, 0, 0.6);
      text-transform: uppercase;
    }
    .rule-row {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      background: #fff;
      padding: 4px 0;
      border-radius: 4px;
    }
    .rule-row.cdk-drag-preview {
      box-shadow: 0 5px 10px rgba(0,0,0,0.15);
      padding: 4px 8px;
    }
    .rule-row.cdk-drag-placeholder {
      opacity: 0.3;
    }
    .col-drag {
      flex: 0 0 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .drag-handle {
      cursor: grab;
      color: rgba(0,0,0,0.38);
      display: flex;
      align-items: center;
    }
    .drag-handle:active {
      cursor: grabbing;
    }
    .drag-handle mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
    .col-entity {
      flex: 0 0 160px;
      min-width: 160px;
    }
    .col-attribute {
      flex: 1;
      min-width: 0;
    }
    .col-permission {
      flex: 0 0 130px;
      min-width: 130px;
    }
    .col-actions {
      flex: 0 0 auto;
      margin-top: 4px;
    }
    .default-rule {
      border-top: 1px solid rgba(0, 0, 0, 0.12);
      padding-top: 10px;
      margin-top: 4px;
    }
    .default-label {
      font-weight: 600;
      font-size: 0.85em;
      color: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
    }
    .default-hint {
      font-size: 0.8em;
      color: rgba(0, 0, 0, 0.38);
      display: flex;
      align-items: center;
    }
    .add-rule-inline {
      margin-top: 4px;
      align-self: flex-start;
    }
    .rules-actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      padding-top: 8px;
    }
    mat-expansion-panel {
      margin-bottom: 8px;
    }
    .add-rule-btn {
      margin-top: 4px;
    }
  `],
})
export class ManageRolesDialogComponent implements OnInit, OnDestroy {
  private dialogRef = inject(MatDialogRef<ManageRolesDialogComponent>);
  private http = inject(HttpClient);
  private snackBar = inject(MatSnackBar);

  loading = signal(true);
  roles = signal<RoleData[]>([]);
  entityTypes = signal<string[]>([]);

  private saveSubjects = new Map<string, Subject<RoleData>>();
  private subscriptions: Subscription[] = [];

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
    this.saveSubjects.forEach(s => s.complete());
  }

  loadData(): void {
    this.loading.set(true);
    this.loadEntityTypes();
    this.loadRoles();
  }

  loadRoles(): void {
    this.http.get<{ roles: string[] }>('/api/v1/admin/roles').subscribe({
      next: (res) => {
        const roleNames = res.roles || [];
        if (roleNames.length === 0) {
          this.roles.set([]);
          this.loading.set(false);
          return;
        }
        const fetched: RoleData[] = [];
        let pending = roleNames.length;
        for (const name of roleNames) {
          this.http.get<RoleData>(`/api/v1/admin/roles/${encodeURIComponent(name)}`).subscribe({
            next: (roleData) => {
              fetched.push(this.ensureDefaultRule(roleData));
              if (--pending === 0) {
                fetched.sort((a, b) => a.name.localeCompare(b.name));
                this.roles.set(fetched);
                this.loading.set(false);
              }
            },
            error: () => {
              fetched.push({ name, rules: [{ permission: 'none' }] });
              if (--pending === 0) {
                fetched.sort((a, b) => a.name.localeCompare(b.name));
                this.roles.set(fetched);
                this.loading.set(false);
              }
            },
          });
        }
      },
      error: () => {
        this.roles.set([]);
        this.loading.set(false);
      },
    });
  }

  loadEntityTypes(): void {
    this.http.get<{ entityTypes: string[] }>('/api/v1/admin/roles/entity-types').subscribe({
      next: (res) => this.entityTypes.set(res.entityTypes || []),
      error: () => this.entityTypes.set([]),
    });
  }

  addRole(): void {
    const name = prompt('Role name:');
    if (!name?.trim()) return;

    this.http.post<RoleData>('/api/v1/admin/roles', { name: name.trim() }).subscribe({
      next: (roleData) => {
        const role = this.ensureDefaultRule(roleData);
        this.roles.update(roles => [...roles, role].sort((a, b) => a.name.localeCompare(b.name)));
        this.snackBar.open('Role created', '', { duration: 2000, panelClass: ['snackbar-success'] });
      },
      error: (err) => {
        this.snackBar.open(err.error?.message || 'Failed to create role', '', {
          duration: 3000, panelClass: ['snackbar-error'],
        });
      },
    });
  }

  addRule(role: RoleData): void {
    role.rules.push({ permission: 'none', attribute: 'attr' });
    this.ensureDefaultLast(role);
    this.debouncedSave(role);
  }

  removeRule(role: RoleData, index: number): void {
    if (index >= role.rules.length - 1) return;
    role.rules.splice(index, 1);
    this.debouncedSave(role);
  }

  deleteRole(role: RoleData): void {
    if (!confirm(`Delete role "${role.name}"?`)) return;

    this.http.delete(`/api/v1/admin/roles/${encodeURIComponent(role.name)}`).subscribe({
      next: () => {
        this.roles.update(roles => roles.filter(r => r.name !== role.name));
        this.snackBar.open('Role deleted', '', { duration: 2000, panelClass: ['snackbar-success'] });
      },
      error: () => {
        this.snackBar.open('Failed to delete role', '', {
          duration: 3000, panelClass: ['snackbar-error'],
        });
      },
    });
  }

  onDrop(role: RoleData, event: CdkDragDrop<RoleRule[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    if (event.currentIndex >= role.rules.length - 1) return;
    if (event.previousIndex >= role.rules.length - 1) return;
    moveItemInArray(role.rules, event.previousIndex, event.currentIndex);
    this.debouncedSave(role);
  }

  defaultPermission(role: RoleData): string {
    const last = role.rules[role.rules.length - 1];
    return last?.permission ?? 'none';
  }

  setDefaultPermission(role: RoleData, permission: string): void {
    let last = role.rules[role.rules.length - 1];
    if (!last || last.entity !== undefined || last.attribute !== undefined) {
      last = { permission: permission as RoleRule['permission'] };
      role.rules.push(last);
    } else {
      last.permission = permission as RoleRule['permission'];
    }
    this.debouncedSave(role);
  }

  private ensureDefaultRule(role: RoleData): RoleData {
    if (!role.rules) role.rules = [];
    const last = role.rules[role.rules.length - 1];
    if (!last || last.entity !== undefined || last.attribute !== undefined) {
      role.rules.push({ permission: 'none' });
    }
    return role;
  }

  private ensureDefaultLast(role: RoleData): void {
    const defaultIdx = role.rules.findIndex(r => r.entity === undefined && r.attribute === undefined);
    if (defaultIdx >= 0 && defaultIdx < role.rules.length - 1) {
      const [def] = role.rules.splice(defaultIdx, 1);
      role.rules.push(def);
    }
  }

  debouncedSave(role: RoleData): void {
    let subject = this.saveSubjects.get(role.name);
    if (!subject) {
      subject = new Subject<RoleData>();
      const sub = subject.pipe(debounceTime(300)).subscribe(r => this.doSave(r));
      this.subscriptions.push(sub);
      this.saveSubjects.set(role.name, subject);
    }
    subject.next(role);
  }

  private doSave(role: RoleData): void {
    const payload = {
      rules: role.rules.map(r => {
        const rule: Record<string, unknown> = { permission: r.permission };
        if (r.entity !== undefined) rule['entity'] = r.entity;
        if (r.attribute !== undefined) rule['attribute'] = r.attribute;
        return rule;
      }),
    };
    this.http.put(`/api/v1/admin/roles/${encodeURIComponent(role.name)}`, payload).subscribe({
      error: () => {
        this.snackBar.open('Failed to save role', '', {
          duration: 3000, panelClass: ['snackbar-error'],
        });
      },
    });
  }
}
