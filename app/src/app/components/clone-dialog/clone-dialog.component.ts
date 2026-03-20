import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-clone-dialog',
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
    <h2 mat-dialog-title>{{ 'Clone Repository' | translate }}</h2>
    <mat-dialog-content class="clone-dialog-content">
      <p class="clone-dialog-description">
        {{ 'Enter a repository URL in OAuth notation. Example:' | translate }}
        <br />
        <code>https://oauth2:github_abcabc...&#64;github.com/brainboutique/zenea-data-test.git</code>
      </p>
      <mat-form-field appearance="outline" class="clone-input-field">
        <mat-label>{{ 'Repository URL' | translate }}</mat-label>
        <input
          matInput
          [(ngModel)]="repositoryUrl"
          placeholder="https://oauth2:token&#64;github.com/owner/repo.git"
          (keydown.enter)="submit()"
        />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'Cancel' | translate }}</button>
      <button
        mat-raised-button
        color="primary"
        [disabled]="!repositoryUrl.trim()"
        (click)="submit()"
      >
        {{ 'Clone' | translate }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .clone-dialog-content {
        min-width: 320px;
        max-width: 520px;
      }
      .clone-dialog-description {
        font-size: 0.85rem;
        color: rgba(0, 0, 0, 0.7);
        margin-bottom: 12px;
      }
      .clone-dialog-description code {
        font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
        font-size: 0.8rem;
      }
      .clone-input-field {
        width: 100%;
      }
    `,
  ],
})
export class CloneDialogComponent {
  repositoryUrl = '';

  constructor(private dialogRef: MatDialogRef<CloneDialogComponent>) {}

  submit(): void {
    const value = this.repositoryUrl?.trim();
    if (!value) return;
    this.dialogRef.close(value);
  }
}

