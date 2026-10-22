import { Component, computed, inject, input } from '@angular/core';
import { CdkMenuModule } from '@angular/cdk/menu';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { MenuItem } from '../../menu/menu.config';
import { MenuActionService } from '../../services/menu-action.service';

@Component({
  selector: 'app-menu-list',
  standalone: true,
  imports: [CdkMenuModule, RouterLink, TranslatePipe, MenuListComponent],
  templateUrl: './menu-list.component.html',
  styleUrl: './menu-list.component.scss',
})
export class MenuListComponent {
  readonly menu = inject(MenuActionService);

  items = input.required<MenuItem[]>();

  readonly visible = computed(() => this.menu.visibleItems(this.items()));

  activate(item: MenuItem): void {
    this.menu.run(item);
  }
}
