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

import { Injectable, signal, computed } from '@angular/core';

/** Service for the current page title shown in the main app header. */
@Injectable({ providedIn: 'root' })
export class PageTitleService {
  private readonly _title = signal<string>('');
  private readonly _loading = signal<boolean>(false);

  /** Current page title (e.g. "Entities" or entity display name). */
  readonly pageTitle = computed(() => this._title());

  /** Whether title is loading (entity data not yet loaded). */
  readonly loading = computed(() => this._loading());

  setTitle(value: string): void {
    this._loading.set(true);
    this._title.set(value);
  }

  /** Mark title as loaded (data arrived). Call after entity data loads. */
  markLoaded(): void {
    this._loading.set(false);
  }

  clearTitle(): void {
    this._title.set('');
    this._loading.set(false);
  }
}
