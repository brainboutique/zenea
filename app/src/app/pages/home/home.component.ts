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

import { Component, afterNextRender, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { hasSeenCurrentWelcome, WelcomeComponent } from '../welcome/welcome.component';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink, MatButton, MatIcon, TranslateModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  constructor() {
    afterNextRender(() => {
      const requiresAuth = this.auth.requiresAuth$();
      const hasSession = this.auth.hasValidSession();

      if (requiresAuth && !hasSession) {
        this.router.navigate(['/login']);
        return;
      }

      if (!hasSeenCurrentWelcome()) {
        this.dialog.open(WelcomeComponent, {
          width: '80vw',
          height: '80vh',
          maxWidth: '80vw',
          maxHeight: '80vh',
        });
      }
    });
  }
}
