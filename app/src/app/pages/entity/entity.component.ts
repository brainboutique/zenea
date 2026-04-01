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

import { Component, OnInit, signal, computed, effect, inject, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { EntityApiService } from '../../services/entity-api.service';
import { EntityApplicationComponent, ApplicationData } from '../entity-application/entity-application.component';
import { ApplicationsService } from '../../services/ApplicationsService';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PageTitleService } from '../../services/page-title.service';
import { EntityHeaderService } from '../../services/entity-header.service';
import { AuthorizationService } from '../../services/authorization.service';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-entity',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatProgressSpinnerModule, EntityApplicationComponent, TranslateModule],
  templateUrl: './entity.component.html',
  styleUrl: './entity.component.scss',
})
export class EntityComponent implements OnInit, OnDestroy {
  /** Plain-text representation of the JSON document (pretty-printed). */
  content = signal<string | null>(null);
  /** Parsed entity data (for type check and passing to entity-application). */
  entityData = signal<ApplicationData | null>(null);
  /** Error message when fetch fails (e.g. 404). */
  error = signal<string | null>(null);
  loading = signal(true);
  /** GUID from route. */
  guid = signal<string | null>(null);
  /** Entity type from route (e.g. Application). */
  type = signal<string>('Application');
  /** True after a child mutates data; cleared after successful save. */
  hasUnsavedChanges = signal(false);
  /** True while PUT request is in flight. */
  saving = signal(false);
  /** Error from last save attempt (cleared on next mutate or successful save). */
  saveError = signal<string | null>(null);

  /** Debounce delay for auto-save in milliseconds. */
  private readonly AUTOSAVE_DEBOUNCE_MS = 3000;
  /** Timer handle for the pending auto-save. */
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  isApplication = computed(() => this.entityData()?.type === 'Application');
  displayName = computed(() => this.entityData()?.displayName ?? '');
  showHeader = computed(() => !this.loading() && !this.error() && this.entityData() != null);

  private pageTitleService = inject(PageTitleService);
  private entityHeaderService = inject(EntityHeaderService);
  private authorization = inject(AuthorizationService);

  readonly canEdit = this.authorization.canEdit;

  constructor(
    private route: ActivatedRoute,
    private entityService: EntityApiService,
    private applicationsService: ApplicationsService,
  ) {
    effect(() => {
      const name = this.displayName();
      if (name) {
        this.pageTitleService.setTitle(name);
      }
    });
    effect(() => {
      const show = this.showHeader();
      this.entityHeaderService.setShowSaveBar(show);
      if (show) {
        this.entityHeaderService.registerSave(() => this.save());
        this.entityHeaderService.registerSaveAndWait(() => this.save$());
      }
    });
    effect(() => {
      if (this.showHeader()) {
        this.entityHeaderService.updateState({
          saveError: this.saveError(),
          hasUnsavedChanges: this.hasUnsavedChanges(),
          saving: this.saving(),
        });
      }
    });
  }

  ngOnInit(): void {
    const guid = this.route.snapshot.paramMap.get('guid');
    const type = this.route.snapshot.paramMap.get('type') ?? 'Application';
    this.type.set(type);
    this.guid.set(guid);
    if (!guid) {
      this.error.set('Missing GUID');
      this.loading.set(false);
      return;
    }

    this.entityService.getEntity(guid, type).subscribe({
      next: (data) => {
        this.entityData.set(data as ApplicationData);
        this.content.set(JSON.stringify(data, null, 2));
        this.error.set(null);
        this.loading.set(false);
      },
      error: (err) => {
        if (err?.status === 404) {
          // New entity: show empty form; Save will create it via PUT
          this.entityData.set({ type });
          this.content.set(null);
          this.error.set(null);
        } else {
          this.error.set(err?.message || 'Failed to load entity.');
          this.content.set(null);
          this.entityData.set(null);
        }
        this.loading.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    this.pageTitleService.clearTitle();
    this.entityHeaderService.setShowSaveBar(false);
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /** Called when a child mutates entity data (pass-by-reference). Syncs derived state (raw JSON). */
  notifyDataMutated = (): void => {
    const d = this.entityData();
    if (!d) return;
    this.entityData.set(d);
    this.content.set(JSON.stringify(d, null, 2));
    this.hasUnsavedChanges.set(true);
    this.saveError.set(null);

    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      if (this.hasUnsavedChanges()) {
        this.save();
      }
    }, this.AUTOSAVE_DEBOUNCE_MS);
  };

  /** Trigger an immediate save (e.g. from "Save now" UI), cancelling any pending auto-save. */
  saveNow(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    this.save();
  }

  /** Run save and return an observable that emits true on success, false on error. Used e.g. by back-button to save before navigating. */
  save$(): Observable<boolean> {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    const g = this.guid();
    const type = this.type();
    const data = this.entityData();
    if (!g || !data || !type) {
      return of(true);
    }
    this.saving.set(true);
    this.saveError.set(null);
    return this.entityService.putEntity(g, data, type).pipe(
      map(() => {
        // Keep migration-target dialog options in sync after creating/renaming/TIME-updating applications.
        if (type === 'Application') this.applicationsService.invalidateMigrationTargetOptionsCache();
        this.hasUnsavedChanges.set(false);
        this.saving.set(false);
        return true;
      }),
      catchError((err) => {
        this.saveError.set(err?.message ?? 'Failed to save.');
        this.saving.set(false);
        return of(false);
      }),
    );
  }

  save(): void {
    this.save$().subscribe();
  }
}
