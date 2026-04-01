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
import { UniverseComponent } from './pages/universe/universe.component';
import { MapApplicationTransformationComponent } from './pages/map-application-transformation/map-application-transformation.component';
import { TermsAndConditionsComponent } from './pages/terms-and-conditions/terms-and-conditions.component';
import { LoginComponent } from './pages/login/login.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'list/Applications', component: ApplicationListComponent },
  {
    path: 'map/Application/transformation',
    component: MapApplicationTransformationComponent,
  },
  { path: 'universe', component: UniverseComponent },
  { path: 'view/:guid', component: EntityComponent },
  { path: 'entity/:type/:guid', component: EntityComponent },
  { path: 'termsAndConditions', component: TermsAndConditionsComponent },
];
