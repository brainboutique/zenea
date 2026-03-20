import {Injectable} from '@angular/core';
import {MissingTranslationHandler, MissingTranslationHandlerParams} from '@ngx-translate/core';

@Injectable()
export class KeyAsDefaultHandler implements MissingTranslationHandler {
  handle(params: MissingTranslationHandlerParams): string {
    let result = params.key;
    if (params.interpolateParams) {
      for (const [key, value] of Object.entries(params.interpolateParams)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value ?? ''));
      }
    }
    return result;
  }
}
