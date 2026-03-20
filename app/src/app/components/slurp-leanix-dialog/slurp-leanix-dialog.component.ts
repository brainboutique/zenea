import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslateModule } from '@ngx-translate/core';

export interface SlurpLeanixDialogData {
  repoName: string;
  branch: string;
}

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
    TranslateModule,
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
        <mat-checkbox [(ngModel)]="types.application">Application</mat-checkbox>
        <mat-checkbox [(ngModel)]="types.userGroup">UserGroup</mat-checkbox>
        <mat-checkbox [(ngModel)]="types.businessCapability">BusinessCapability</mat-checkbox>
        <mat-checkbox [(ngModel)]="types.platform">Platform</mat-checkbox>
        <mat-checkbox [(ngModel)]="types.itComponent">ITComponent</mat-checkbox>
      </div>
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
      .slurp-leanix-entities-title {
        font-weight: 600;
        margin-top: 4px;
      }
    `,
  ],
})
export class SlurpLeanixDialogComponent {
  baseUrl = '';
  bearerToken = '';
  cookies = 'lxRegion=eu';
  types = {
    application: true,
    userGroup: false,
    businessCapability: false,
    platform: false,
    itComponent: false,
  };

  constructor(
    private dialogRef: MatDialogRef<SlurpLeanixDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SlurpLeanixDialogData
  ) {}

  private selectedTypesCsv(): string {
    const selected: string[] = [];
    if (this.types.application) selected.push('Application');
    if (this.types.userGroup) selected.push('UserGroup');
    if (this.types.businessCapability) selected.push('BusinessCapability');
    if (this.types.platform) selected.push('Platform');
    if (this.types.itComponent) selected.push('ITComponent');
    return selected.join(',');
  }

  canSlurp(): boolean {
    return !!this.baseUrl?.trim() && !!this.bearerToken?.trim() && !!this.cookies?.trim();
  }

  slurpNow(): void {
    if (!this.canSlurp()) return;
    const token = this.bearerToken.trim();
    const auth = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    this.dialogRef.close({
      baseUrl: this.baseUrl.trim().replace(/\/+$/, ''),
      bearerToken: auth,
      cookies: this.cookies?.trim() || undefined,
      types: this.selectedTypesCsv(),
    });
  }
}
