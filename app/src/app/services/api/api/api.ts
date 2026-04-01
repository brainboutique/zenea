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

export * from './applications.service';
import { ApplicationsService } from './applications.service';
export * from './entity.service';
import { EntityService } from './entity.service';
export * from './facets.service';
import { FacetsService } from './facets.service';
export * from './git.service';
import { GitService } from './git.service';
export const APIS = [ApplicationsService, EntityService, FacetsService, GitService];
