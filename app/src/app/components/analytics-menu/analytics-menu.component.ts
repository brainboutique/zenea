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

import {
  Component,
  inject,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { UserConfigService } from '../../services/user-config.service';

@Component({
  selector: 'app-analytics-menu',
  standalone: true,
  imports: [CommonModule, MatMenuModule, MatButtonModule, RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './analytics-menu.component.html',
  styleUrl: './analytics-menu.component.scss',
})
export class AnalyticsMenuComponent {
  readonly userConfig = inject(UserConfigService);

  openMenu(trigger: MatMenuTrigger) {
    trigger.openMenu();
  }
  closeMenu(trigger: MatMenuTrigger) {
    trigger.closeMenu();
  }
}
