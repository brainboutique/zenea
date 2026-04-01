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

import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';

const STORAGE_KEY = 'l8er_lang';
const SUPPORTED_LANGS = ['en', 'de', 'es'] as const;

export type LangCode = (typeof SUPPORTED_LANGS)[number];

/** Language option with value and icon (SVG) for dropdown. */
interface LangOption {
  value: LangCode;
  ariaLabel: string;
}

@Component({
  selector: 'app-language-selector',
  standalone: true,
  imports: [CommonModule, MatMenuModule, MatButtonModule],
  templateUrl: './language-selector.component.html',
  styleUrl: './language-selector.component.scss',
})
export class LanguageSelectorComponent implements OnInit {
  currentLang: LangCode = 'en';

  readonly languages: LangOption[] = [
    { value: 'en', ariaLabel: 'English' },
    { value: 'de', ariaLabel: 'Deutsch' },
    { value: 'es', ariaLabel: 'Español' },
  ];

  constructor(
    private translate: TranslateService,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
    const existing = (this.translate.currentLang || this.translate.defaultLang || '').slice(0, 2);
    if (existing && SUPPORTED_LANGS.includes(existing as LangCode)) {
      this.currentLang = existing as LangCode;
      return;
    }
    if (isPlatformBrowser(this.platformId)) {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      if (stored && SUPPORTED_LANGS.includes(stored as LangCode)) {
        this.currentLang = stored as LangCode;
      } else {
        const browser = this.translate.getBrowserLang?.() ?? (typeof navigator !== 'undefined' && navigator.language?.slice(0, 2));
        this.currentLang = (browser && SUPPORTED_LANGS.includes(browser as LangCode) ? browser : 'en') as LangCode;
      }
      this.translate.use(this.currentLang);
    } else {
      this.currentLang = (this.translate.currentLang as LangCode) || 'en';
      if (!SUPPORTED_LANGS.includes(this.currentLang)) {
        this.currentLang = 'en';
      }
    }
  }

  openMenu(trigger: MatMenuTrigger): void {
    trigger.openMenu();
  }

  closeMenu(trigger: MatMenuTrigger): void {
    trigger.closeMenu();
  }

  selectLang(lang: LangCode): void {
    if (!SUPPORTED_LANGS.includes(lang)) return;
    this.currentLang = lang;
    this.translate.use(lang);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, lang);
    }
  }
}
