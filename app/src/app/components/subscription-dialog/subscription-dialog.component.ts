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

import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { TranslatePipe } from '@ngx-translate/core';
import type { SubscriptionItem } from '../../models/subscription-item';
import { SUBSCRIPTION_TYPE_OPTIONS, subscriptionTypeColor } from '../../models/subscription-item';

export interface SubscriptionDialogData {
  currentSelection: SubscriptionItem[];
}

@Component({
  selector: 'app-subscription-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSelectModule,
    TranslatePipe,
  ],
  templateUrl: './subscription-dialog.component.html',
  styleUrl: './subscription-dialog.component.scss',
})
export class SubscriptionDialogComponent {
  private dialogRef = inject(MatDialogRef<SubscriptionDialogComponent>);
  private data = inject<SubscriptionDialogData>(MAT_DIALOG_DATA);

  readonly subscriptionTypeOptions = [...SUBSCRIPTION_TYPE_OPTIONS];

  readonly selection = signal<SubscriptionItem[]>([]);

  readonly newType = signal<string>('OBSERVER');
  readonly newName = signal<string>('');
  readonly newEmail = signal<string>('');

  constructor() {
    const initial = Array.isArray(this.data?.currentSelection) ? this.data.currentSelection : [];
    this.selection.set(
      initial
        .filter((it) => it && typeof it === 'object' && typeof it.id === 'string' && it.id.length > 0)
        .map((it) => ({ ...it }))
    );
  }

  subscriptionTypeColor(type: string): string {
    return subscriptionTypeColor(type);
  }

  remove(id: string): void {
    this.selection.update((prev) => prev.filter((s) => s.id !== id));
  }

  addNew(): void {
    const name = this.newName().trim();
    if (!name) return;
    const newItem: SubscriptionItem = {
      id: this.generateGuid(),
      type: this.newType(),
      displayName: name,
      email: this.newEmail().trim() || undefined,
    };
    this.selection.update((prev) => [...prev, newItem]);
    this.newName.set('');
    this.newEmail.set('');
    this.newType.set('OBSERVER');
  }

  private generateGuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  ok(): void {
    this.dialogRef.close(this.selection());
  }
}
