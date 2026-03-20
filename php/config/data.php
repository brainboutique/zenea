<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Entity data directory
    |--------------------------------------------------------------------------
    |
    | Path to the directory containing entity JSON files and meta (e.g. applications.json, facets.json).
    | Defaults to project root "data" (one level above the Laravel app). Set DATA_PATH in .env to override.
    |
    */
    'path' => env('DATA_PATH', base_path('../data')),

    /*
    |--------------------------------------------------------------------------
    | Git access token (optional)
    |--------------------------------------------------------------------------
    |
    | When set, the Git API uses this token to authenticate with the remote (origin).
    | The token is injected into the remote URL only for the duration of fetch/push;
    | it is not stored in .git/config. Use a Personal Access Token (GitLab/GitHub) or
    | OAuth token. Set GIT_ACCESS_TOKEN in .env. Username can be overridden with
    | GIT_USERNAME (default: oauth2 for GitLab; use your username for GitHub if needed).
    |
    */
    'git_access_token' => env('GIT_ACCESS_TOKEN'),
    'git_username' => env('GIT_USERNAME', 'oauth2'),

    /*
    |--------------------------------------------------------------------------
    | Git author/committer identity (optional)
    |--------------------------------------------------------------------------
    |
    | If set, the Git service will run "git config user.name" and "git config
    | user.email" in the data repository before committing, so commits have a
    | stable identity without relying on global git config. Values are taken
    | from GIT_USER_NAME and GIT_USER_EMAIL.
    |
    */
    'git_user_name' => env('GIT_USER_NAME'),
    'git_user_email' => env('GIT_USER_EMAIL'),

    /*
    |--------------------------------------------------------------------------
    | Git data root for cloned repositories
    |--------------------------------------------------------------------------
    |
    | Base directory under which Git data repositories are cloned. Defaults to
    | the same "../data" directory that is used for entity data.
    |
    */
    'git_root' => env('GIT_ROOT', base_path('../data')),
];
