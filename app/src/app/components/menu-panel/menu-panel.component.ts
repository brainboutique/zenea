import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { MenuItem } from '../../menu/menu.config';
import { MenuActionService } from '../../services/menu-action.service';

@Component({
  selector: 'app-menu-panel',
  standalone: true,
  imports: [RouterLink, MatIconModule, TranslatePipe, MenuPanelComponent],
  templateUrl: './menu-panel.component.html',
  styleUrl: './menu-panel.component.scss',
})
export class MenuPanelComponent {
  readonly menu = inject(MenuActionService);

  items = input.required<MenuItem[]>();
  closed = output<void>();

  readonly visible = computed(() => this.menu.visibleItems(this.items()));

  private readonly expandedIds = signal<ReadonlySet<string>>(new Set());

  isOpen(id: string): boolean {
    return this.expandedIds().has(id);
  }

  toggle(item: MenuItem): void {
    const next = new Set(this.expandedIds());
    if (!next.delete(item.id)) {
      next.add(item.id);
    }
    this.expandedIds.set(next);
  }

  activate(item: MenuItem): void {
    this.menu.run(item);
    this.closed.emit();
  }
}
