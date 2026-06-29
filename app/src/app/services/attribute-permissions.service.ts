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
 * You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <https://www.gnu.org/>.
 */

import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AttributePermissionsService {
  private readonly _readable = signal<Set<string> | null>(null);
  private readonly _writable = signal<Set<string> | null>(null);

  readonly readable = this._readable.asReadonly();
  readonly writable = this._writable.asReadonly();

  isReadable(attribute: string): boolean {
    const s = this._readable();
    return s === null || s.has(attribute);
  }

  isWritable(attribute: string): boolean {
    const s = this._writable();
    return s === null || s.has(attribute);
  }

  setReadable(attrs: Set<string> | null): void {
    this._readable.set(attrs);
  }

  setWritable(attrs: Set<string> | null): void {
    this._writable.set(attrs);
  }

  reset(): void {
    this._readable.set(null);
    this._writable.set(null);
  }
}
