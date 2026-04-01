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

import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';

/** State for entity save actions shown in the main app header when viewing an entity. */
@Injectable({ providedIn: 'root' })
export class EntityHeaderService {
  /** When true, the main header shows save error + Save button. */
  readonly showSaveBar = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly hasUnsavedChanges = signal(false);
  readonly saving = signal(false);

  private saveFn: (() => void) | null = null;
  /** Returns an observable that emits true when save succeeded, false on error. */
  private saveAndWaitFn: (() => Observable<boolean>) | null = null;

  registerSave(fn: () => void): void {
    this.saveFn = fn;
  }

  /** Register a save function that returns an observable completing when save finishes. */
  registerSaveAndWait(fn: () => Observable<boolean>): void {
    this.saveAndWaitFn = fn;
  }

  triggerSave(): void {
    this.saveFn?.();
  }

  /** If there are unsaved changes, run save and return an observable that emits true on success, false on error. Otherwise returns of(true). */
  saveAndWait(): Observable<boolean> {
    if (!this.hasUnsavedChanges()) {
      return of(true);
    }
    return this.saveAndWaitFn?.() ?? of(true);
  }

  updateState(state: {
    saveError: string | null;
    hasUnsavedChanges: boolean;
    saving: boolean;
  }): void {
    this.saveError.set(state.saveError);
    this.hasUnsavedChanges.set(state.hasUnsavedChanges);
    this.saving.set(state.saving);
  }

  /** Called by EntityComponent when it has loaded and can show the bar. */
  setShowSaveBar(show: boolean): void {
    this.showSaveBar.set(show);
    if (!show) {
      this.saveError.set(null);
      this.saveFn = null;
      this.saveAndWaitFn = null;
    }
  }
}
