import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogRef } from '@angular/material/dialog';
import { SampleDataService } from '../../services/sample-data.service';
import { TranslateModule } from '@ngx-translate/core';

export const WELCOME_STORAGE_KEY = 'zenea.welcome.seen';
export const WELCOME_VERSION = 2;

/** Result values passed to HomeComponent via afterClosed(). */
export type WelcomeResult = 'applications' | 'demo-created' | 'closed' | undefined;

/** Returns true when the stored welcome version is current. */
export function hasSeenCurrentWelcome(): boolean {
  try {
    const stored = localStorage.getItem(WELCOME_STORAGE_KEY);
    return stored !== null && Number(stored) >= WELCOME_VERSION;
  } catch {
    return false;
  }
}

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, TranslateModule],
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.scss',
})
export class WelcomeComponent {
  private readonly dialogRef = inject(MatDialogRef<WelcomeComponent, WelcomeResult>);
  private readonly sampleData = inject(SampleDataService);
  private readonly router = inject(Router);

  isCreating = false;

  onCreateSampleData(): void {
    this.isCreating = true;
    this.markWelcomeSeen();

    this.sampleData.generateSampleData(10).subscribe({
      next: () => { this.isCreating = false; this.dialogRef.close(); this.router.navigate(['/list/Applications']); },
      error: () => { this.isCreating = false; this.dialogRef.close(); this.router.navigate(['/list/Applications']); },
    });
  }

  onGoToApplications(): void {
    this.markWelcomeSeen();
    this.dialogRef.close();
    this.router.navigate(['/list/Applications']);
  }

  onClose(): void {
    this.markWelcomeSeen();
    this.dialogRef.close('closed');
  }

  private markWelcomeSeen(): void {
    try {
      localStorage.setItem(WELCOME_STORAGE_KEY, String(WELCOME_VERSION));
    } catch {
      // ignore storage errors – continue gracefully
    }
  }
}


