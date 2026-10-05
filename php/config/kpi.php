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
    | Migration target lifecycle options
    |--------------------------------------------------------------------------
    |
    | Values for the migrationTarget.edges[].lifecycle field on Application entities.
    | Used to compute the "Migrations" pseudo-entity KPI.
    |
    */
    'migration_lifecycle_options' => [
        'Idea',
        'Validated',
        'Confirmed',
        'Planned',
        'Running',
        'Done',
        'Discarded',
    ],

    /*
    |--------------------------------------------------------------------------
    | KPI capture debounce seconds
    |--------------------------------------------------------------------------
    |
    | After a data mutation, wait this many seconds before capturing KPIs.
    | If another mutation occurs within the window, the timer resets.
    |
    */
    'debounce_seconds' => 10,
];
