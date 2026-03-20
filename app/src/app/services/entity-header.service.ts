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
