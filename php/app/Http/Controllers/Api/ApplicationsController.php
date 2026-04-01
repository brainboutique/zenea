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
use App\Services\ApplicationsService;
use App\Services\DataPathResolver;
use Illuminate\Http\JsonResponse;

class ApplicationsController extends Controller
{
    public function __construct(
        private ApplicationsService $applications,
        private DataPathResolver $dataPathResolver
    ) {
    }

    private function resolvePath(?string $repoName, ?string $branch): string
    {
        try {
            // Applications aggregate currently operate on the base repo/branch path (no type subdirectory).
            return $this->dataPathResolver->resolve($repoName, $branch, null);
        } catch (\InvalidArgumentException $e) {
            abort(400, $e->getMessage());
        }
    }

    /**
     * @OA\Get(
     *     path="/api/v1/{repoName}/{branch}/applications",
     *     operationId="getApplicationsRepoBranch",
     *     tags={"Applications"},
     *     summary="Get applications document",
     *     description="Returns the list of active applications from /data/{repoName}/{branch}. Use repoName=local, branch=default for default data.",
     *     @OA\Parameter(name="repoName", in="path", required=true, description="Repository name", @OA\Schema(type="string")),
     *     @OA\Parameter(name="branch", in="path", required=true, description="Branch name", @OA\Schema(type="string")),
     *     @OA\Response(response="200", description="Applications document", @OA\JsonContent()),
     * )
     */
    public function getApplications(string $repoName, string $branch): JsonResponse
    {
        $path = $this->resolvePath($repoName, $branch);
        $data = $this->applications->getCached($path);

        return response()->json($data);
    }
}
