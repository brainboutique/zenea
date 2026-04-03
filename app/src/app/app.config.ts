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

import {ApplicationConfig, ErrorHandler, APP_INITIALIZER, provideZoneChangeDetection} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import {DATE_PIPE_DEFAULT_OPTIONS, DatePipe} from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { BASE_PATH } from './services/api';
import { apiParseErrorInterceptor } from './services/api-parse-error.interceptor';
import { authInterceptor } from './services/auth.interceptor';
import { AuthService } from './services/auth.service';
import {MissingTranslationHandler, provideTranslateService} from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import {KeyAsDefaultHandler} from './services/KeyAsDefaultHandler';
import { provideMarkdown, MERMAID_OPTIONS } from 'ngx-markdown';
// import * as Sentry from "@sentry/angular";
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    { provide: APP_INITIALIZER, useFactory: (auth: AuthService) => () => auth.initFromHash(), deps: [AuthService], multi: true },
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    provideAnimationsAsync(),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, apiParseErrorInterceptor])),
    provideMarkdown(),
    {
      provide: MERMAID_OPTIONS,
      useValue: {
        startOnLoad: true,
        theme: 'default',
        // Office applications (PowerPoint/Word) often drop text when Mermaid uses
        // `foreignObject` (HTML labels). Force pure SVG labels.
        htmlLabels: false,
        // Some Mermaid versions still look at the flowchart-specific flag.
        flowchart: { htmlLabels: false },
        // Allow rendering of special characters (e.g. `>` in labels) without
        // converting them to HTML entities like `&gt;`.
        securityLevel: 'loose',
      },
    },
    provideTranslateService({ fallbackLang: 'en' }),
    provideTranslateHttpLoader({ prefix: 'i18n/', suffix: '.json' }),
    {
      provide: MissingTranslationHandler,
      useClass: KeyAsDefaultHandler
    },
    DatePipe,
    {
      provide: DATE_PIPE_DEFAULT_OPTIONS,
      useValue: { dateFormat: 'dd.MM.yyyy HH:mm' }
    },
    // Empty string = same origin (API at /api/v1/* on the host serving the SPA). For local dev, use same host or proxy.
    { provide: BASE_PATH, useValue: '' },
    /*
    {
      provide: ErrorHandler,
      useValue: Sentry.createErrorHandler(),
    },
    */
    // Note: we configure Mermaid via the MERMAID_OPTIONS provider above.
  ]
};
