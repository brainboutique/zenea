import { Injectable, signal, computed } from '@angular/core';

/** Service for the current page title shown in the main app header. */
@Injectable({ providedIn: 'root' })
export class PageTitleService {
  private readonly title = signal<string>('');

  /** Current page title (e.g. "Entities" or entity display name). */
  readonly pageTitle = computed(() => this.title());

  setTitle(value: string): void {
    this.title.set(value);
  }

  clearTitle(): void {
    this.title.set('');
  }
}
