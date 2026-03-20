<?php

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
    ],
];
