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

import { Component, Inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe } from '@ngx-translate/core';
import { LeanixSlurpService } from '../../services/leanix-slurp.service';
import { UserConfigService } from '../../services/user-config.service';

export interface SlurpLeanixDialogData {
  repoName: string;
  branch: string;
}

const STORAGE_KEY_BASE_URL = 'leanix_slurp_baseUrl';
const STORAGE_KEY_IGNORE_ATTRS = 'leanix_slurp_ignoreAttributes';

@Component({
  selector: 'app-slurp-leanix-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatCheckboxModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatExpansionModule,
    MatProgressSpinnerModule,
    TranslatePipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'Slurp from LeanIX' | translate }}</h2>
    <mat-dialog-content class="slurp-leanix-content">
      <p class="slurp-leanix-info">
        Imports (and overwrites) selected entities in {{ data.repoName }} / {{ data.branch }} based on LeanIX database.
      </p>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="slurp-leanix-field">
        <mat-label>{{ 'Base URL' | translate }}</mat-label>
        <input matInput [(ngModel)]="baseUrl" placeholder="https://demo.leanix.net" />
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="slurp-leanix-field">
        <mat-label>{{ 'Bearer Token' | translate }}</mat-label>
        <input matInput type="password" [(ngModel)]="bearerToken" [placeholder]="'Your LeanIX Bearer token' | translate" />
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="slurp-leanix-field">
        <mat-label>{{ 'Cookies' | translate }}</mat-label>
        <input matInput [(ngModel)]="cookies" placeholder="lxRegion=eu; _shibsession_..." />
      </mat-form-field>

      <div class="slurp-leanix-entities">
        <div class="slurp-leanix-entities-title">Entities</div>
        <mat-checkbox [(ngModel)]="types.application" (change)="onTypesChange()">Application</mat-checkbox>
        <mat-checkbox [(ngModel)]="types.tag" (change)="onTypesChange()">Tags</mat-checkbox>
        <mat-checkbox [(ngModel)]="types.tagGroup" (change)="onTypesChange()">TagGroups</mat-checkbox>
        <mat-checkbox [(ngModel)]="types.userGroup" (change)="onTypesChange()">UserGroup</mat-checkbox>
        <mat-checkbox [(ngModel)]="types.businessCapability" (change)="onTypesChange()">BusinessCapability</mat-checkbox>
        <mat-checkbox [(ngModel)]="types.platform" (change)="onTypesChange()">Platform</mat-checkbox>
        <mat-checkbox [(ngModel)]="types.itComponent" (change)="onTypesChange()">ITComponent</mat-checkbox>
      </div>

      <div class="slurp-leanix-settings">
        <div class="slurp-leanix-settings-title">Settings</div>
        <mat-checkbox [(ngModel)]="autoRemoveDeleted">Auto-remove deleted items</mat-checkbox>
      </div>

      @if (attributeKeys().length > 0 || attributesLoading()) {
        <mat-expansion-panel class="slurp-leanix-attributes-panel">
          <mat-expansion-panel-header
            title="Select attributes to preserve from existing local data. Unchecked attributes will be overwritten from LeanIX.">
            <mat-panel-title>Ignore LeanIX Attributes</mat-panel-title>
          </mat-expansion-panel-header>
          @if (attributesLoading()) {
            <mat-progress-spinner mode="indeterminate" diameter="24"></mat-progress-spinner>
          }
          <div class="slurp-leanix-attributes-list">
            @for (key of attributeKeys(); track key) {
              <mat-checkbox [(ngModel)]="ignoreAttributeMap[key]" class="slurp-leanix-attribute-item">
                {{ key }}
              </mat-checkbox>
            }
          </div>
        </mat-expansion-panel>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'Cancel' | translate }}</button>
      <button mat-raised-button color="primary" (click)="slurpNow()" [disabled]="!canSlurp()">
        {{ 'Slurp Now' | translate }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .slurp-leanix-content {
        min-width: 360px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .slurp-leanix-info {
        margin: 0 0 8px 0;
        color: rgba(0, 0, 0, 0.7);
        font-size: 0.95em;
      }
      .slurp-leanix-field {
        width: 100%;
      }
      .slurp-leanix-entities {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-top: 8px;
      }
      .slurp-leanix-entities-title,
      .slurp-leanix-settings-title {
        font-weight: 600;
        margin-top: 4px;
      }
      .slurp-leanix-settings {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-top: 8px;
      }
      .slurp-leanix-attributes-panel {
        margin-top: 8px;
      }
      .slurp-leanix-attributes-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
        max-height: 300px;
        overflow-y: auto;
      }
      .slurp-leanix-attribute-item {
        font-size: 0.85em;
      }
    `,
  ],
})
export class SlurpLeanixDialogComponent implements OnInit {
  baseUrl = '';
  bearerToken = '';
  cookies = 'lxRegion=eu';
  types = {
    application: true,
    tag: false,
    tagGroup: false,
    userGroup: false,
    businessCapability: false,
    platform: false,
    itComponent: false,
  };
  autoRemoveDeleted = false;
  attributeKeys = signal<string[]>([]);
  ignoreAttributeMap: Record<string, boolean> = {};
  attributesLoading = signal(false);

  constructor(
    private dialogRef: MatDialogRef<SlurpLeanixDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SlurpLeanixDialogData,
    private leanixService: LeanixSlurpService,
    private userConfig: UserConfigService
  ) {
    const savedBaseUrl = localStorage.getItem(STORAGE_KEY_BASE_URL);
    if (savedBaseUrl) {
      this.baseUrl = savedBaseUrl;
    }
    const savedIgnoreAttrs = localStorage.getItem(STORAGE_KEY_IGNORE_ATTRS);
    if (savedIgnoreAttrs) {
      try {
        const arr = JSON.parse(savedIgnoreAttrs);
        if (Array.isArray(arr)) {
          for (const k of arr) {
            this.ignoreAttributeMap[k] = true;
          }
        }
      } catch { /* ignore malformed */ }
    }
  }

  ngOnInit(): void {
    this.loadAttributeKeys();
  }

  private getSelectedTypes(): string[] {
    const selected: string[] = [];
    if (this.types.application) selected.push('Application');
    if (this.types.tag) selected.push('Tag');
    if (this.types.tagGroup) selected.push('TagGroup');
    if (this.types.userGroup) selected.push('UserGroup');
    if (this.types.businessCapability) selected.push('BusinessCapability');
    if (this.types.platform) selected.push('Platform');
    if (this.types.itComponent) selected.push('ITComponent');
    return selected;
  }

  private selectedTypesCsv(): string {
    return this.getSelectedTypes().join(',');
  }

  onTypesChange(): void {
    this.loadAttributeKeys();
  }

  private loadAttributeKeys(): void {
    const selectedTypes = this.getSelectedTypes();
    if (selectedTypes.length === 0) {
      this.attributeKeys.set([]);
      return;
    }

    this.attributesLoading.set(true);
    const repoName = this.data.repoName || 'local';
    const branch = this.data.branch || 'default';

    const allKeys = new Set<string>();
    let completed = 0;

    for (const type of selectedTypes) {
      this.leanixService.getAttributeKeys(repoName, branch, type).subscribe({
        next: (keys) => {
          keys.forEach((k) => allKeys.add(k));
          completed++;
          if (completed === selectedTypes.length) {
            const sorted = Array.from(allKeys).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            this.attributeKeys.set(sorted);

            const newMap: Record<string, boolean> = {};
            for (const k of sorted) {
              newMap[k] = this.ignoreAttributeMap[k] ?? false;
            }
            this.ignoreAttributeMap = newMap;
            this.attributesLoading.set(false);
          }
        },
        error: () => {
          completed++;
          if (completed === selectedTypes.length) {
            this.attributesLoading.set(false);
          }
        },
      });
    }
  }

  canSlurp(): boolean {
    return !!this.baseUrl?.trim() && !!this.bearerToken?.trim() && !!this.cookies?.trim();
  }

  slurpNow(): void {
    if (!this.canSlurp()) return;
    const token = this.bearerToken.trim();
    const auth = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

    const ignoredAttrs = Object.keys(this.ignoreAttributeMap).filter(
      (k) => this.ignoreAttributeMap[k]
    );

    localStorage.setItem(STORAGE_KEY_BASE_URL, this.baseUrl.trim());
    localStorage.setItem(STORAGE_KEY_IGNORE_ATTRS, JSON.stringify(ignoredAttrs));

    this.dialogRef.close({
      baseUrl: this.baseUrl.trim().replace(/\/+$/, ''),
      bearerToken: auth,
      cookies: this.cookies?.trim() || undefined,
      types: this.selectedTypesCsv(),
      autoRemoveDeleted: this.autoRemoveDeleted,
      ignoreAttributes: ignoredAttrs.join(','),
    });
  }
}
