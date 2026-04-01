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

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ConfigController;
use App\Http\Controllers\Api\FacetController;
use App\Http\Controllers\Api\ApplicationsController;
use App\Http\Controllers\Api\BusinessCapabilitiesController;
use App\Http\Controllers\Api\DataProductsController;
use App\Http\Controllers\Api\ITComponentsController;
use App\Http\Controllers\Api\PlatformsController;
use App\Http\Controllers\Api\UserGroupsController;
use App\Http\Controllers\Api\GitController;
use App\Http\Controllers\Api\MollieController;
use App\Http\Controllers\Api\LeanixController;
use App\Http\Controllers\Api\EntityController;
use App\Http\Controllers\Api\LocalAuthController;
use App\Http\Controllers\Api\AuthorizationController;
use App\Http\Controllers\Api\UserManagementController;
use App\Http\Middleware\EnsureAuth;
use App\Http\Middleware\EnsureAuthorization;
use Illuminate\Support\Facades\Route;

// --- Optional Google OAuth: login redirect and callback (no auth required) ---
Route::get('auth/login', [AuthController::class, 'login']);
Route::get('auth/callback', [AuthController::class, 'callback']);

// --- Optional Local Auth: login and logout endpoints (no auth required) ---
Route::post('auth/local/login', [LocalAuthController::class, 'login']);
Route::post('auth/local/logout', [LocalAuthController::class, 'logout']);

// --- License info: public endpoint (no auth required) ---
Route::get('license', [ConfigController::class, 'getLicense']);

// --- Auth mode info: returns the current authentication mode (no auth required) ---
Route::get('auth/mode', function () {
    return response()->json(['mode' => config('auth.mode', '')]);
});

// --- All routes below require valid auth based on AUTHENTICATION mode ---
Route::middleware([EnsureAuth::class])->group(function () {
    // --- Authorization info for current user ---
    Route::get('authorization', [AuthorizationController::class, 'getAuthorization']);

    // --- Config: set default repo/branch (requires read access to the specified repo) ---
    Route::put('config', [ConfigController::class, 'updateConfig']);

    // --- Admin-only routes: git clone, create branch, user management ---
    Route::middleware([EnsureAuthorization::class . ':admin'])->group(function () {
        Route::post('git/clone', [GitController::class, 'cloneRepository']);
        Route::get('admin/users', [UserManagementController::class, 'index']);
        Route::put('admin/users/{username}', [UserManagementController::class, 'update']);
        Route::post('admin/users/{username}/password', [UserManagementController::class, 'generatePassword']);
        Route::post('admin/users', [UserManagementController::class, 'store']);
        Route::delete('admin/users/{username}', [UserManagementController::class, 'destroy']);
    });

    // --- Write routes: require edit access ---
    Route::middleware([EnsureAuthorization::class . ':edit'])->group(function () {
        Route::put('{repoName}/{branch}/entity/{type}/{guid}', [EntityController::class, 'putEntityRepoBranch']);
        Route::post('{repoName}/{branch}/entity/{type}/{guid}', [EntityController::class, 'postEntityRepoBranch']);
        Route::patch('{repoName}/{branch}/entity/{type}/{guid}', [EntityController::class, 'patchEntityRepoBranch']);
        Route::delete('{repoName}/{branch}/entity/{type}/{guid}', [EntityController::class, 'deleteEntityRepoBranch']);
        Route::post('{repoName}/{branch}/git/commit-and-push', [GitController::class, 'commitAndPush']);
        Route::post('{repoName}/{branch}/leanix/slurp', [LeanixController::class, 'slurp']);

        // Git pull requires admin for creating new branches, but edit for existing branches
        // handled in controller based on whether branch exists
        Route::post('git/{repoName}/{branch}/pull', [GitController::class, 'pull']);
    });

    // --- Read routes: require read access ---
    Route::middleware([EnsureAuthorization::class . ':read'])->group(function () {
        Route::get('{repoName}/{branch}/entities/{type}', [EntityController::class, 'listEntities']);
        Route::get('{repoName}/{branch}/entities', [EntityController::class, 'listEntities']);
        Route::get('{repoName}/{branch}/entries', [EntityController::class, 'listEntities']);
        Route::get('{repoName}/{branch}/entity/{type}/{guid}', [EntityController::class, 'getEntityRepoBranch']);
        Route::get('{repoName}/{branch}/facets', [FacetController::class, 'getFacets']);
        Route::get('{repoName}/{branch}/applications', [ApplicationsController::class, 'getApplications']);
        Route::get('{repoName}/{branch}/business-capabilities', [BusinessCapabilitiesController::class, 'getBusinessCapabilities']);
        Route::get('{repoName}/{branch}/data-products', [DataProductsController::class, 'getDataProducts']);
        Route::get('{repoName}/{branch}/it-components', [ITComponentsController::class, 'getITComponents']);
        Route::get('{repoName}/{branch}/platforms', [PlatformsController::class, 'getPlatforms']);
        Route::get('{repoName}/{branch}/user-groups', [UserGroupsController::class, 'getUserGroups']);
        Route::get('{repoName}/{branch}/git/history/{type}/{guid}', [GitController::class, 'fileHistory']);
    });

    // --- Git branches: filtered by user authorization (no repo/branch middleware) ---
    Route::get('git/branches', [GitController::class, 'branches']);
});
