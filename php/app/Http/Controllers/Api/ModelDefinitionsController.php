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
use App\Services\DataPathResolver;
use App\Services\ModelDefinitionsService;
use Illuminate\Http\JsonResponse;

class ModelDefinitionsController extends Controller
{
    public function __construct(
        private ModelDefinitionsService $modelDefinitionsService,
        private DataPathResolver $dataPathResolver
    ) {
    }

    private function resolvePath(?string $repoName, ?string $branch): string
    {
        try {
            return $this->dataPathResolver->resolve($repoName, $branch, null);
        } catch (\InvalidArgumentException $e) {
            abort(400, $e->getMessage());
        }
    }

    /**
     * @OA\Get(
     *     path="/api/v1/{repoName}/{branch}/model-definitions",
     *     operationId="getModelDefinitionsRepoBranch",
     *     tags={"ModelDefinitions"},
     *     summary="Get all _model.json definitions for entity types",
     *     description="Returns a JSON object keyed by entity type (Application, UserGroup, etc.) with the contents of each type's _model.json file.",
     *     @OA\Parameter(name="repoName", in="path", required=true, description="Repository name", @OA\Schema(type="string")),
     *     @OA\Parameter(name="branch", in="path", required=true, description="Branch name", @OA\Schema(type="string")),
     *     @OA\Response(response="200", description="Model definitions keyed by entity type", @OA\JsonContent(type="object"))
     * )
     */
    public function getModelDefinitions(string $repoName, string $branch): JsonResponse
    {
        $basePath = $this->resolvePath($repoName, $branch);

        $definitions = $this->modelDefinitionsService->loadAll($basePath);

        return response()->json($definitions);
    }
}
