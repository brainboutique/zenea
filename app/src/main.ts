import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import * as Sentry from "@sentry/angular";
import { BUILD_VERSION } from './app/build-info';

Sentry.init({
  dsn: undefined,
  'environment': window.location.hostname,
  'release': BUILD_VERSION === '{{BUILD_VERSION}}' ? '—' : BUILD_VERSION,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.feedbackIntegration({
      colorScheme: "system",
    }),
  ],
  tracesSampleRate: 1.0,
  enableLogs: true,
});
Sentry.addEventProcessor(event => {
  // Helper to strip hash from one URL string
  const stripHash = (url?: string | null): string | undefined => {
    if (!url) return url ?? undefined;
    try {
      const u = new URL(url, window.location.origin);
      if (u.hash) u.hash = '...';
      return u.toString();
    } catch {
      // Fallback if it's a relative or weird URL
      const idx = url.indexOf('#');
      return idx >= 0 ? (url.substring(0, idx)+"#...") : url;
    }
  };

  // 1) The primary request URL
  if (event.request && event.request.url) {
    event.request.url = stripHash(event.request.url);
  }

  // @ts-ignore
  if (event['urls']) {
    // @ts-ignore
    let u=event['urls'];
    for(let i=0;i<u.length;i++)
      u[i]=stripHash((u[i]));
  }

  // 2) Breadcrumbs with URLs (XHR/fetch/navigation, etc.)
  if (event.breadcrumbs && Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs.forEach((b) => {
      if (b.data && typeof b.data['url'] === 'string') {
        b.data['url'] = stripHash(b.data['url']);
      }
      if (b.data && typeof b.data['from'] === 'string') {
        b.data['from'] = stripHash(b.data['from']);
      }
      if (b.data && typeof b.data['to'] === 'string') {
        b.data['to'] = stripHash(b.data['to']);
      }
    });
  }

  if (event.spans && Array.isArray(event.spans)) {
    event.spans.forEach((b) => {
      if (typeof b['description'] === 'string') {
        b['description'] = stripHash(b['description']);
      }
    });
  }

  if (event?.contexts && event?.contexts['feedback'] && typeof event?.contexts['feedback']['url'] === 'string')
    event.contexts['feedback']['url']=stripHash(event.contexts['feedback']['url'])
  return event;
});

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
