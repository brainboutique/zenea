import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { languageResolver } from './resolvers/language.resolver';
import { HomeComponent } from './pages/home/home.component';
import { EntityComponent } from './pages/entity/entity.component';
import { ApplicationListComponent } from './pages/list/list.component';
import { UniverseComponent } from './pages/universe/universe.component';
import { MapApplicationTransformationComponent } from './pages/map-application-transformation/map-application-transformation.component';
import { TermsAndConditionsComponent } from './pages/terms-and-conditions/terms-and-conditions.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
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
