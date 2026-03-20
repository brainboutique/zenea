import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { UserConfigService } from '../../services/user-config.service';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-settings-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    TranslateModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'Settings' | translate }}</h2>
    <mat-dialog-content class="settings-dialog-content">
      <mat-checkbox [(ngModel)]="hideSensitiveInformation" (ngModelChange)="onHideSensitiveChange($event)">
        {{ 'Hide sensitive information' | translate }}
      </mat-checkbox>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'Close' | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .settings-dialog-content {
        min-width: 320px;
        max-width: 420px;
      }
    `,
  ],
})
export class SettingsDialogComponent {
  private userConfig = inject(UserConfigService);

  hideSensitiveInformation = this.userConfig.getHideSensitiveInformation();

  onHideSensitiveChange(value: boolean): void {
    this.userConfig.setHideSensitiveInformation(value);
  }
}
