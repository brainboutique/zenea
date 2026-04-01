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

import { Component, Inject, PLATFORM_ID, OnInit, inject, ViewChild, effect, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterOutlet, NavigationEnd, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { filter, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { BUILD_VERSION } from './build-info';
import { PageTitleService } from './services/page-title.service';
import { UserConfigService } from './services/user-config.service';
import { LanguageSelectorComponent } from './components/language-selector/language-selector.component';
import { AdminMenuComponent } from './components/admin-menu/admin-menu.component';
import { EntityHeaderService } from './services/entity-header.service';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { ApplicationMenuComponent } from './components/application-menu/application-menu.component';
import { ConfigService } from './services/config.service';
import { WelcomeComponent } from './pages/welcome/welcome.component';
import { AuthService } from './services/auth.service';
import { AuthorizationService } from './services/authorization.service';
import { LoadingOverlayService } from './services/loading-overlay.service';

const STORAGE_KEY = 'ZenEA_lang';
const SUPPORTED_LANGS = ['en', 'de', 'es'] as const;

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    RouterOutlet,
    TranslateModule,
    RouterLink,
    RouterLinkActive,
    LanguageSelectorComponent,
    AdminMenuComponent,
    MatButtonModule,
    MatMenuModule,
    MatIconModule,
    ApplicationMenuComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  /** Avoid flashing the default route (landing) on deep links until the router has applied the current URL. */
  routerReady = false;
  /** Build/version string shown in bottom-left (from build-info.ts, patched at release build). */
  buildVersion = BUILD_VERSION === '{{BUILD_VERSION}}' ? '—' : BUILD_VERSION;

  @ViewChild('applicationsTrigger', { read: MatMenuTrigger }) applicationsTrigger!: MatMenuTrigger;

  readonly pageTitle = inject(PageTitleService).pageTitle;
  readonly entityHeader = inject(EntityHeaderService);
  readonly userConfig = inject(UserConfigService);
  readonly loadingOverlay = inject(LoadingOverlayService);
  private router = inject(Router);
  private configService = inject(ConfigService);
  private dialog = inject(MatDialog);
  private auth = inject(AuthService);
  private authorization = inject(AuthorizationService);

  /** Company name from a valid license; null means no valid license (non-commercial notice shown). */
  company: string | null = null;
  /** True while license is being loaded; hide the license footer until loaded. */
  licenseLoading = true;

  isEntityRoute = false;
  showNav = signal(false);

  private applicationsCloseTimeout: ReturnType<typeof setTimeout> | null = null;
  private applicationsMenuOpenedAt = 0;
  private static readonly TRIGGER_LEAVE_CLOSE_DELAY_MS = 220;
  /** Ignore trigger mouseleave shortly after open so staying on the trigger doesn't blink. */
  private static readonly TRIGGER_LEAVE_GRACE_MS = 280;

  constructor(
    private translate: TranslateService,
    @Inject(PLATFORM_ID) private platformId: object
  ) {
    effect(() => {
      const repo = this.userConfig.repoName$();
      const branch = this.userConfig.branch$();
      if (isPlatformBrowser(this.platformId) && this.auth.hasValidSession$()) {
        this.authorization.fetchAuthorization();
      }
    });

    effect(() => {
      const authMode = this.auth.authMode$();
      const hasSession = this.auth.hasValidSession$();
      if (isPlatformBrowser(this.platformId)) {
        const requiresAuth = authMode === 'Local' || authMode === 'Google';
        this.showNav.set(!requiresAuth || hasSession);
      }
    });
  }

  ngOnInit(): void {
    // Check if current route is a language route (/en, /de, /es)
    const currentPath = this.router.url.split('?')[0]; // Remove query params
    const routeLang = currentPath === '/en' || currentPath === '/de' || currentPath === '/es'
      ? currentPath.substring(1)
      : null;

    if (routeLang && SUPPORTED_LANGS.includes(routeLang as any)) {
      // Language route takes precedence
      this.translate.use(routeLang);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, routeLang);
      }
    } else if (isPlatformBrowser(this.platformId)) {
      // Fall back to stored preference or browser language
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED_LANGS.includes(stored as any)) {
        this.translate.use(stored);
      } else {
        const browser = this.translate.getBrowserLang?.() || navigator.language?.slice(0, 2);
        const mapped = browser && SUPPORTED_LANGS.includes(browser as any) ? browser : 'en';
        this.translate.use(mapped);
      }
    }
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((event) => {
        this.isEntityRoute = event.urlAfterRedirects.startsWith('/entity');
        if (!this.routerReady) {
          this.routerReady = true;
        }
      });

    this.configService.getLicense().subscribe({
      next: ({ license }) => {
        this.licenseLoading = false;
        if (!license) return;
        try {
          const token = license.trim();
          let  decoded = atob(token).trim();
          if (decoded.startsWith('\'') && decoded.endsWith('\'') && decoded.length >= 2) {
            decoded = decoded.slice(1, -1);
          }
          const parsed = JSON.parse(decoded);
          if (parsed?.key === 'h2lO8sh267HmmBaaA8jjkAllWui' && parsed?.company) {
            this.company = parsed.company;
          }
        } catch {
          // invalid license — keep company as null
        }
      },
      error: () => {
        this.licenseLoading = false;
        // ignore network errors — fall back to non-commercial
      },
    });

    // Check authentication mode and show login if required
    if (isPlatformBrowser(this.platformId)) {
      this.auth.getRequiresAuth().subscribe((response) => {
        const requiresAuth = response.mode && response.mode !== '';
        const hasSession = this.auth.hasValidSession();
        this.showNav.set(!requiresAuth || hasSession);

        if (requiresAuth && !hasSession && this.router.url !== '/login') {
          if (response.mode === 'Local') {
            this.router.navigate(['/login']);
          }
        } else if (hasSession) {
          this.authorization.fetchAuthorization();
        }
      });
    }
  }

  onApplicationsTriggerClick(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.applicationsTrigger?.closeMenu();
    this.router.navigate(['/list/Applications']);
  }

  closeApplicationsMenu(): void {
    this.applicationsTrigger?.closeMenu();
  }

  openApplicationsMenu(): void {
    this.applicationsTrigger?.openMenu();
    this.applicationsMenuOpenedAt = Date.now();
  }

  cancelApplicationsClose(): void {
    if (this.applicationsCloseTimeout != null) {
      clearTimeout(this.applicationsCloseTimeout);
      this.applicationsCloseTimeout = null;
    }
  }

  scheduleApplicationsClose(): void {
    if (Date.now() - this.applicationsMenuOpenedAt < AppComponent.TRIGGER_LEAVE_GRACE_MS) {
      return;
    }
    this.cancelApplicationsClose();
    this.applicationsCloseTimeout = setTimeout(() => {
      this.applicationsTrigger?.closeMenu();
      this.applicationsCloseTimeout = null;
    }, AppComponent.TRIGGER_LEAVE_CLOSE_DELAY_MS);
  }

  onBackToList(): void {
    this.entityHeader.saveAndWait().subscribe((success) => {
      if (success) {
        this.router.navigate(['/list/Applications']);
      }
    });
  }

  onShowWelcome(): void {
    this.dialog.open(WelcomeComponent, {
      width: '80vw',
      height: '80vh',
      maxWidth: '80vw',
      maxHeight: '80vh',
    });
  }
}
