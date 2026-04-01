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

import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/** Locale codes supported by the API (emails, etc.). */
export type ApiLocale = 'en' | 'de' | 'es';

export const SUPPORTED_API_LOCALES: readonly ApiLocale[] = ['en', 'de', 'es'];

/**
 * Resolves the current UI language to an API locale (en, de, es).
 * Use when calling backend APIs that accept a locale (e.g. email language).
 */
@Injectable({ providedIn: 'root' })
export class LocaleService {
  constructor(private translate: TranslateService) {}

  /**
   * Returns the current app language normalized to an API locale.
   * Falls back to 'en' if the current language is not supported.
   */
  getApiLocale(): ApiLocale {
    const current = this.translate.currentLang || this.translate.defaultLang || 'en';
    return SUPPORTED_API_LOCALES.includes(current as ApiLocale) ? (current as ApiLocale) : 'en';
  }
}
