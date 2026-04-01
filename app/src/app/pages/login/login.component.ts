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

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AuthorizationService } from '../../services/authorization.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    TranslateModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  username = '';
  password = '';
  errorMessage: string | null = null;
  isLoading = false;

  private auth = inject(AuthService);
  private authorization = inject(AuthorizationService);
  private router = inject(Router);

  onSubmit(): void {
    if (!this.username.trim() || !this.password) {
      this.errorMessage = 'Username and password are required';
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    this.auth.loginLocal(this.username.trim(), this.password).subscribe({
      next: () => {
        this.isLoading = false;
        this.authorization.fetchAuthorization();
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.isLoading = false;
        if (err.status === 401) {
          this.errorMessage = 'Invalid username or password';
        } else if (err.status === 0) {
          this.errorMessage = 'Unable to connect to server';
        } else {
          this.errorMessage = err.error?.message || 'Login failed';
        }
      },
    });
  }
}
