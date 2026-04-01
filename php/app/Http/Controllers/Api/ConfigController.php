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

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AuthorizationService;
use App\Services\ConfigurationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ConfigController extends Controller
{
    public function __construct(
        private ConfigurationService $config,
        private AuthorizationService $authorizationService
    ) {
    }

    /**
     * Update default repository and branch in server configuration.
     *
     * @OA\Put(
     *     path="/api/v1/config",
     *     operationId="updateConfig",
     *     tags={"Config"},
     *     summary="Set default repo and branch",
     *     description="Persist the default repository name and branch in /data/.meta.json. New sessions will use these as default.",
     *     @OA\RequestBody(required=true, @OA\JsonContent(
     *         required={"defaultRepositoryName","defaultBranch"},
     *         @OA\Property(property="defaultRepositoryName", type="string", example="local"),
     *         @OA\Property(property="defaultBranch", type="string", example="main")
     *     )),
     *     @OA\Response(response="200", description="Updated configuration", @OA\JsonContent(
     *         @OA\Property(property="defaultRepositoryName", type="string"),
     *         @OA\Property(property="defaultBranch", type="string")
     *     )),
     *     @OA\Response(response="400", description="Validation error")
     * )
     */
    /**
     * Return the raw LICENSE environment variable value for the frontend to decode and validate.
     *
     * @OA\Get(
     *     path="/api/v1/license",
     *     operationId="getLicense",
     *     tags={"Config"},
     *     summary="Get license token",
     *     description="Returns the raw LICENSE env value (base64-encoded JSON). Empty string when not configured.",
     *     @OA\Response(response="200", description="License token", @OA\JsonContent(
     *         @OA\Property(property="license", type="string", example="")
     *     ))
     * )
     */
    public function getLicense(): JsonResponse
    {
        return response()->json(['license' => env('LICENSE', '')]);
    }

    public function updateConfig(Request $request): JsonResponse
    {
        $username = $request->attributes->get('auth_email');
        $repoName = $request->input('defaultRepositoryName');
        $branch = $request->input('defaultBranch');

        if (! is_string($repoName) || trim($repoName) === '') {
            return response()->json(['message' => 'defaultRepositoryName is required and must be a non-empty string'], 400);
        }
        if (! is_string($branch) || trim($branch) === '') {
            return response()->json(['message' => 'defaultBranch is required and must be a non-empty string'], 400);
        }

        $repoName = trim($repoName);
        $branch = trim($branch);

        if ($username !== null && ! $this->authorizationService->canRead($username, $repoName, $branch)) {
            return response()->json([
                'message' => 'You do not have read access to this repository.',
            ], 403);
        }

        $config = $this->config->updateConfiguration([
            'defaultRepositoryName' => $repoName,
            'defaultBranch' => $branch,
        ]);

        return response()->json([
            'defaultRepositoryName' => $config['defaultRepositoryName'] ?? $repoName,
            'defaultBranch' => $config['defaultBranch'] ?? $branch,
        ]);
    }
}
