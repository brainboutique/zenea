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
    | Optional Google OAuth (OpenID Connect)
    |--------------------------------------------------------------------------
    |
    | When both client_id and client_secret are set, all API routes (except
    | auth/login and auth/callback) require a valid Google ID token (Bearer).
    | When either is empty, no authentication is enforced.
    |
    */
    'client_id' => env('GOOGLE_CLIENT_ID', ''),
    'client_secret' => env('GOOGLE_CLIENT_SECRET', ''),

    // Public base URL for OAuth redirect URI (e.g. "https://zenea.mycompany.com").
    // Required when running behind a reverse proxy where APP_URL does not match the
    // externally visible host. Falls back to APP_URL when empty.
    'redirect_base_url' => env('GOOGLE_REDIRECT_BASE_URL', ''),
];
