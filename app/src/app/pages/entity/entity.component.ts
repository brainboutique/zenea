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

import { Component, OnInit, signal, computed, effect, inject, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Observable, of, Subscription } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { EntityApiService } from '../../services/entity-api.service';
import { EntityApplicationComponent, ApplicationData } from '../entity-application/entity-application.component';
import { EntityServiceCatalogSectionComponent } from '../entity-service-catalog-item/entity-service-catalog-item.component';
import { EntityServiceCatalogServiceComponent } from '../entity-service-catalog-service/entity-service-catalog-service.component';
import { ApplicationsService } from '../../services/ApplicationsService';
import { ServiceCatalogService } from '../../services/ServiceCatalogService';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PageTitleService } from '../../services/page-title.service';
import { EntityHeaderService } from '../../services/entity-header.service';
import { AuthorizationService } from '../../services/authorization.service';
import { TranslateModule } from '@ngx-translate/core';
import { UserConfigService } from '../../services/user-config.service';

@Component({
  selector: 'app-entity',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatProgressSpinnerModule, EntityApplicationComponent, EntityServiceCatalogSectionComponent, EntityServiceCatalogServiceComponent, TranslateModule],
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
  /** Subscription for route param changes. */
  private paramSubscription: Subscription | null = null;

  isApplication = computed(() => this.entityData()?.type === 'Application');
  isServiceCatalogSection = computed(() => this.entityData()?.type === 'ServiceCatalogSection');
  isServiceCatalogService = computed(() => this.entityData()?.type === 'ServiceCatalogService');
  displayName = computed(() => this.entityData()?.displayName ?? '');
  showHeader = computed(() => !this.loading() && !this.error() && this.entityData() != null);

  private pageTitleService = inject(PageTitleService);
  private entityHeaderService = inject(EntityHeaderService);
  private authorization = inject(AuthorizationService);
  private platformId = inject(PLATFORM_ID);
  private userConfig = inject(UserConfigService);

  readonly canEdit = this.authorization.canEdit;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private entityService: EntityApiService,
    private applicationsService: ApplicationsService,
    private serviceCatalogService: ServiceCatalogService,
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
    this.paramSubscription = this.route.paramMap.subscribe(params => {
      if (isPlatformBrowser(this.platformId)) {
        const returnTo = (window.history.state as any)?.returnTo;
        if (returnTo) {
          this.entityHeaderService.setReturnUrl(returnTo);
        } else {
          this.entityHeaderService.setReturnUrl(this.userConfig.projectUrlString('list/Applications'));
        }
      }
      const guid = params.get('guid');
      const type = params.get('type') ?? 'Application';
      this.type.set(type);
      this.guid.set(guid);
      if (!guid) {
        this.error.set('Missing GUID');
        this.loading.set(false);
        return;
      }
      this.loadEntity(guid, type);
    });
  }

  private loadEntity(guid: string, type: string): void {
    const parentGuid = this.route.snapshot.queryParamMap.get('parent');
    this.loading.set(true);
    this.entityData.set(null);
    this.content.set(null);
    this.error.set(null);
    this.hasUnsavedChanges.set(false);
    this.saveError.set(null);

    this.entityService.getEntity(guid, type).subscribe({
      next: (data) => {
        this.entityData.set(data as unknown as ApplicationData);
        this.content.set(JSON.stringify(data, null, 2));
        this.error.set(null);
        this.loading.set(false);
        this.pageTitleService.markLoaded();
        if (parentGuid && type === 'ServiceCatalogSection') {
          const d = this.entityData();
          if (d && !d['parents']) {
            (d as unknown as { parents: string[] }).parents = [parentGuid];
            this.entityData.set(d);
          }
        }
        if (parentGuid && type === 'ServiceCatalogService') {
          const d = this.entityData();
          if (d && !d['parents']) {
            (d as unknown as { parents: string[] }).parents = [parentGuid];
            this.entityData.set(d);
          }
        }
      },
      error: (err) => {
        if (err?.status === 404) {
          let emptyData: Record<string, unknown> = { type };
          if (parentGuid && type === 'ServiceCatalogSection') {
            emptyData = { ...emptyData, parents: [parentGuid] };
          }
          if (parentGuid && type === 'ServiceCatalogService') {
            emptyData = { ...emptyData, parents: [parentGuid] };
          }
          this.entityData.set(emptyData as ApplicationData);
          this.content.set(null);
          this.error.set(null);
          this.pageTitleService.markLoaded();
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
    this.paramSubscription?.unsubscribe();
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
        // Re-pull catalog data after updating a ServiceCatalogSection.
        if (type === 'ServiceCatalogSection') this.serviceCatalogService.invalidateCache();
        // Re-pull catalog data after updating a ServiceCatalogService.
        if (type === 'ServiceCatalogService') this.serviceCatalogService.invalidateCache();
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
