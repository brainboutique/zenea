import { Component, computed, inject } from '@angular/core';
import { CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { MenuItem } from '../../menu/menu.config';
import { MenuActionService } from '../../services/menu-action.service';
import { MenuListComponent } from '../menu-list/menu-list.component';

@Component({
  selector: 'app-menu-bar',
  standalone: true,
  imports: [CdkMenuModule, RouterLink, TranslatePipe, MenuListComponent],
  templateUrl: './menu-bar.component.html',
  styleUrl: './menu-bar.component.scss',
})
export class MenuBarComponent {
  readonly menu = inject(MenuActionService);

  readonly items = computed(() => this.menu.visibleItems(this.menu.roots));

  isActive(item: MenuItem): boolean {
    return this.menu.isActive(item);
  }

  onMenuOpened(item: MenuItem, trigger: CdkMenuTrigger): void {
    this.menu.rememberTrigger(trigger);
    if (item.id === 'admin') {
      this.menu.refreshAuthorization();
    }
  }
}
