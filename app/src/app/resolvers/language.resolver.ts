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
