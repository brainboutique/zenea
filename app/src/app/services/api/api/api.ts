export * from './applications.service';
import { ApplicationsService } from './applications.service';
export * from './entity.service';
import { EntityService } from './entity.service';
export * from './facets.service';
import { FacetsService } from './facets.service';
export * from './git.service';
import { GitService } from './git.service';
export const APIS = [ApplicationsService, EntityService, FacetsService, GitService];
