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
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import {RouterLink, RouterLinkActive} from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
@Component({
  selector: 'app-application-menu',
  standalone: true,
  imports: [CommonModule, MatMenuModule, MatButtonModule, MatDialogModule, MatSnackBarModule, RouterLink, RouterLinkActive, TranslateModule],
  templateUrl: './application-menu.component.html',
  styleUrl: './application-menu.component.scss',
})
export class ApplicationMenuComponent {
  openMenu(trigger: MatMenuTrigger) {
    trigger.openMenu();
  }
  closeMenu(trigger: MatMenuTrigger) {
    trigger.closeMenu();
  }

}
