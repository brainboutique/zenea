<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ConfigController;
use App\Http\Controllers\Api\FacetController;
use App\Http\Controllers\Api\ApplicationsController;
use App\Http\Controllers\Api\GitController;
use App\Http\Controllers\Api\MollieController;
use App\Http\Controllers\Api\LeanixController;
use App\Http\Controllers\Api\EntityController;
use App\Http\Middleware\EnsureGoogleAuth;
use Illuminate\Support\Facades\Route;

// --- Optional Google OAuth: login redirect and callback (no auth required) ---
Route::get('auth/login', [AuthController::class, 'login']);
Route::get('auth/callback', [AuthController::class, 'callback']);

// --- License info: public endpoint (no auth required) ---
Route::get('license', [ConfigController::class, 'getLicense']);

// --- All routes below require valid Google auth when GOOGLE_CLIENT_ID/SECRET are set ---
Route::middleware([EnsureGoogleAuth::class])->group(function () {
    // --- Config: set default repo/branch (must be before {repoName}/{branch} routes) ---
    Route::put('config', [ConfigController::class, 'updateConfig']);

    // --- All data endpoints require repo/branch in path (use "local"/"default" for default data) ---
    // Typed entities endpoint: {type} usually matches the "type" field in the JSON document, e.g. "Application".
    Route::get('{repoName}/{branch}/entities/{type}', [EntityController::class, 'listEntities']);
    // Backwards-compatible alias without explicit type (defaults to base repo/branch path).
    Route::get('{repoName}/{branch}/entities', [EntityController::class, 'listEntities']);
    Route::get('{repoName}/{branch}/entries', [EntityController::class, 'listEntities']);
    Route::get('{repoName}/{branch}/entity/{type}/{guid}', [EntityController::class, 'getEntityRepoBranch']);
    Route::put('{repoName}/{branch}/entity/{type}/{guid}', [EntityController::class, 'putEntityRepoBranch']);
    Route::post('{repoName}/{branch}/entity/{type}/{guid}', [EntityController::class, 'postEntityRepoBranch']);
    Route::patch('{repoName}/{branch}/entity/{type}/{guid}', [EntityController::class, 'patchEntityRepoBranch']);
    Route::delete('{repoName}/{branch}/entity/{type}/{guid}', [EntityController::class, 'deleteEntityRepoBranch']);

    Route::get('{repoName}/{branch}/facets', [FacetController::class, 'getFacets']);
    Route::get('{repoName}/{branch}/applications', [ApplicationsController::class, 'getApplications']);

    Route::post('{repoName}/{branch}/git/commit-and-push', [GitController::class, 'commitAndPush']);

    Route::get('git/branches', [GitController::class, 'branches']);
    Route::post('git/{repoName}/{branch}/pull', [GitController::class, 'pull']);
    Route::post('git/clone', [GitController::class, 'cloneRepository']);

    // --- LeanIX slurp (backend proxy for frontend slurp dialog) ---
    Route::post('{repoName}/{branch}/leanix/slurp', [LeanixController::class, 'slurp']);
});
