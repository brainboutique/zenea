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

import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';

export const languageResolver: ResolveFn<void> = (route) => {
  const translate = inject(TranslateService);
  // Get language from route data first, then from URL path
  const lang = route.data['lang'] || route.url[0]?.path;
  
  if (lang && ['en', 'de', 'es'].includes(lang)) {
    translate.use(lang);
    // Also store in localStorage if available (for client-side)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('l8er_lang', lang);
    }
  }
  
  return undefined;
};
