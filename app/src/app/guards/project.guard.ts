import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot } from '@angular/router';
import { UserConfigService } from '../services/user-config.service';

@Injectable({ providedIn: 'root' })
export class ProjectGuard implements CanActivate {
  constructor(private userConfig: UserConfigService) {}

  canActivate(route: ActivatedRouteSnapshot): boolean {
    const repoName = route.params['repoName'];
    const branch = route.params['branch'];
    if (repoName && branch) {
      this.userConfig.setRepoBranch(repoName, branch);
    }
    return true;
  }
}
