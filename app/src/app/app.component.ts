import { Component, Inject, PLATFORM_ID, OnInit, inject, ViewChild } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterOutlet, NavigationEnd, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { filter } from 'rxjs/operators';
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
  private router = inject(Router);
  private configService = inject(ConfigService);
  private dialog = inject(MatDialog);

  /** Company name from a valid license; null means no valid license (non-commercial notice shown). */
  company: string | null = null;

  isEntityRoute = false;

  private applicationsCloseTimeout: ReturnType<typeof setTimeout> | null = null;
  private applicationsMenuOpenedAt = 0;
  private static readonly TRIGGER_LEAVE_CLOSE_DELAY_MS = 220;
  /** Ignore trigger mouseleave shortly after open so staying on the trigger doesn't blink. */
  private static readonly TRIGGER_LEAVE_GRACE_MS = 280;

  constructor(
    private translate: TranslateService,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

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
        // ignore network errors — fall back to non-commercial
      },
    });
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
