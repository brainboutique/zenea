<?php

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

return [
    /*
    |--------------------------------------------------------------------------
    | Facets cache TTL (days)
    |--------------------------------------------------------------------------
    |
    | Number of days after which the cached facets.json is considered stale and
    | will be rebuilt on next request. Set via FACETS_CACHE_TTL_DAYS in .env.
    |
    */
    'cache_ttl_days' => (float) env('FACETS_CACHE_TTL_DAYS', 1),

    /*
    |--------------------------------------------------------------------------
    | Facet-driving attributes
    |--------------------------------------------------------------------------
    |
    | These attributes on entity JSON files are used to build meta/facets.json.
    | When any of these change for any entity (including creations and deletions),
    | the facets cache should be invalidated.
    |
    */
    'string_facet_keys' => [
        'type',
        'technicalSuitability',
        'businessCriticality',
        'functionalSuitability',
        'lxTimeClassification',
        'lxHostingType',
        'lxProductCategory',
    ],

    'relation_keys' => [
        'relApplicationToPlatform',
        'relProviderApplicationToInterface',
        'relApplicationToBusinessCapability',
        'relApplicationToUserGroup',
        'relBusinessApplicationToDeploymentApplication',
        'relApplicationToProject',
        'relApplicationToDataObject',
        'relApplicationToDataProduct',
    ],
];
