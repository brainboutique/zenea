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

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { languageResolver } from './resolvers/language.resolver';
import { HomeComponent } from './pages/home/home.component';
import { EntityComponent } from './pages/entity/entity.component';
import { ApplicationListComponent } from './pages/list/list.component';
import { ServiceCatalogListComponent } from './pages/service-catalog-list/service-catalog-list.component';
import { UniverseComponent } from './pages/universe/universe.component';
import { MapApplicationTransformationComponent } from './pages/map-application-transformation/map-application-transformation.component';
import { TermsAndConditionsComponent } from './pages/terms-and-conditions/terms-and-conditions.component';
import { LoginComponent } from './pages/login/login.component';
import { HierarchicalTreeComponent } from './pages/hierarchical-tree/hierarchical-tree.component';
import { ReportsComponent } from './pages/reports/reports.component';
import { MigrationsListComponent } from './pages/migrations-list/migrations-list.component';
import { BusinessProcessListComponent } from './pages/business-process-list/business-process-list.component';
import { ApplicationCompareComponent } from './pages/application-compare/application-compare.component';
import { HistoryComponent } from './pages/history/history.component';
import { ProjectGuard } from './guards/project.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'termsAndConditions', component: TermsAndConditionsComponent },
  {
    path: ':repoName/:branch',
    canActivate: [ProjectGuard],
    children: [
      { path: '', redirectTo: 'list/Applications', pathMatch: 'full' },
      { path: 'list/Applications', component: ApplicationListComponent },
      { path: 'list/BusinessProcesses', component: BusinessProcessListComponent },
      { path: 'list/migrations', component: MigrationsListComponent },
      { path: 'list/ServiceCatalog', component: ServiceCatalogListComponent },
      { path: 'list/ServiceCatalog/**', component: ServiceCatalogListComponent },
      {
        path: 'map/Application/transformation',
        component: MapApplicationTransformationComponent,
      },
      { path: 'universe', component: UniverseComponent },
      { path: 'tree/:type', component: HierarchicalTreeComponent },
      { path: 'analytics/reports', component: ReportsComponent },
      { path: 'analytics/history', component: HistoryComponent },
      { path: 'view/:guid', component: EntityComponent },
      { path: 'entity/:type/:guid', component: EntityComponent },
      { path: 'compare/:type', component: ApplicationCompareComponent },
    ],
  },
];
