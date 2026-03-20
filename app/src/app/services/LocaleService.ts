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
