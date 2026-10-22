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

import { Injectable, computed, signal } from '@angular/core';

/** Applies a recorded state snapshot back onto the surface that produced it (e.g. the entity page). */
export type UndoRestoreFn = (state: unknown) => void;

/**
 * Generic in-memory undo/redo history for edits made in the frontend.
 *
 * The state the host just loaded seeds the history via {@link setBaseline},
 * every successful (debounced) save records one snapshot via {@link record}.
 * The history keeps the last {@link UndoService.MAX_ENTRIES} edits plus a
 * pointer to the snapshot currently shown in the UI; {@link undo} and
 * {@link redo} move that pointer and hand a fresh copy of the matching
 * snapshot to the registered restore callback.
 *
 * A save performed after undoing/redoing discards every entry after the
 * current pointer first, so the new save becomes the next step in history.
 *
 * The history is memory-only (no persistence across page changes or reloads)
 * and belongs to one host surface at a time: the host registers itself via
 * {@link register}, scopes history to its content with {@link beginSession}
 * and drops everything again via {@link unregister}.
 */
@Injectable({ providedIn: 'root' })
export class UndoService {
  /** Maximum number of history entries kept; older entries are dropped. */
  static readonly MAX_ENTRIES = 20;

  /** Snapshots in save order (oldest first). */
  private readonly entries = signal<readonly unknown[]>([]);
  /** Index of the snapshot currently applied in the UI. */
  private readonly index = signal(-1);
  /** Restore callback of the active host; null while no host is registered. */
  private readonly restoreFn = signal<UndoRestoreFn | null>(null);
  /** Key of the content the history belongs to (e.g. "BusinessProcess:guid"). */
  private sessionKey: string | null = null;

  /** True when at least one step can be undone (drives the Undo button). */
  readonly canUndo = computed(() => this.restoreFn() !== null && this.index() > 0);

  /** True when at least one step was undone and can be reapplied (drives the Redo button). */
  readonly canRedo = computed(() => {
    const current = this.index();
    return this.restoreFn() !== null && current >= 0 && current < this.entries().length - 1;
  });

  /** Number of entries currently in history (denominator of the button titles). */
  readonly total = computed(() => this.entries().length);

  /** Steps already undone + 1 — numerator of the Undo button title (e.g. "1"). */
  readonly undoPosition = computed(() => this.entries().length - this.index());

  /** Redo steps still available — numerator of the Redo button title. */
  readonly redoPosition = computed(() => this.entries().length - 1 - this.index());

  /** Registers the host that can apply snapshots. Only one host is active at a time. */
  register(restore: UndoRestoreFn): void {
    this.restoreFn.set(restore);
  }

  /**
   * Ends a host session: drops the history and the restore callback.
   * When a `restore` function is given, it is only dropped if that host is
   * still the registered one (a later host taking over is left untouched).
   */
  unregister(restore?: UndoRestoreFn): void {
    if (restore && this.restoreFn() !== restore) return;
    this.restoreFn.set(null);
    this.clear();
  }

  /** Starts a session for the given key; existing history is dropped when the key changes. */
  beginSession(key: string): void {
    if (this.sessionKey === key) return;
    this.sessionKey = key;
    this.clear();
  }

  /**
   * Seeds the history with the freshly loaded state and puts the pointer on
   * it, so the very first save already yields an undoable step ("Undo 1/2")
   * and undoing past it restores exactly what the host loaded. Replaces any
   * existing history (a reload of the same session keeps no stale steps).
   */
  setBaseline(state: unknown): void {
    if (this.restoreFn() === null) return;
    this.entries.set([cloneJson(state)]);
    this.index.set(0);
  }

  /**
   * Records the state persisted by a save as the latest history step:
   * entries after the current step are discarded first (a save following an
   * undo/redo becomes the next step), the history is capped at
   * {@link UndoService.MAX_ENTRIES} and the pointer moves to the new entry.
   *
   * Recording a state that equals the current step is a no-op — that is the
   * save which merely persists an already applied undo/redo restore, and it
   * must not destroy the redo branch.
   */
  record(state: unknown): void {
    if (this.restoreFn() === null) return;
    const snapshot = cloneJson(state);
    const current = this.entries()[this.index()];
    if (current !== undefined && jsonEqual(current, snapshot)) return;

    const kept = this.entries().slice(0, this.index() + 1);
    const next = [...kept, snapshot];
    const trimmed =
      next.length > UndoService.MAX_ENTRIES ? next.slice(next.length - UndoService.MAX_ENTRIES) : next;
    this.entries.set(trimmed);
    this.index.set(trimmed.length - 1);
  }

  /** Moves one step back and applies the older snapshot to the host. */
  undo(): void {
    if (!this.canUndo()) return;
    const target = this.index() - 1;
    this.index.set(target);
    this.apply(this.entries()[target]);
  }

  /** Moves one step forward and applies the newer snapshot to the host. */
  redo(): void {
    if (!this.canRedo()) return;
    const target = this.index() + 1;
    this.index.set(target);
    this.apply(this.entries()[target]);
  }

  /** Hands a detached copy of the snapshot to the host so live edits cannot corrupt history. */
  private apply(state: unknown): void {
    this.restoreFn()?.(cloneJson(state));
  }

  private clear(): void {
    this.entries.set([]);
    this.index.set(-1);
  }
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
