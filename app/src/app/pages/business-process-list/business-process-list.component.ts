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

import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PageTitleService } from '../../services/page-title.service';
import { UserConfigService } from '../../services/user-config.service';
import { BusinessProcessesDataService } from '../../services/business-processes-data.service';
import type { BusinessProcessItem } from '../../services/business-processes-data.service';

@Component({
  selector: 'app-business-process-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './business-process-list.component.html',
  styleUrl: './business-process-list.component.scss',
})
export class BusinessProcessListComponent implements OnInit {
  private router = inject(Router);
  private pageTitleService = inject(PageTitleService);
  private userConfig = inject(UserConfigService);
  private bpService = inject(BusinessProcessesDataService);

  searchQuery = signal('');
  loading = computed(() => this.bpService.loading());
  fullCount = computed(() => this.bpService.processes().length);

  filteredProcesses = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const all = this.bpService.processes();
    if (!query) return all;
    return all.filter((p) => p.name.toLowerCase().includes(query));
  });

  displayedCount = computed(() => this.filteredProcesses().length);

  ngOnInit(): void {
    this.pageTitleService.setTitle('Business Processes');
    this.bpService.ensureLoaded();
  }

  onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
  }

  onNameClick(process: BusinessProcessItem): void {
    this.router.navigate(this.userConfig.projectUrl(['entity', 'BusinessProcess', process.rbaEntityId]));
  }

  stripHtml(html: string | null | undefined): string {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent ?? div.innerText ?? '').trim();
  }
}
