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
use App\Services\EntityStorageService;
use App\Services\SupportEntityTypesService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class EntityController extends Controller
{
    public function __construct(
        private EntityStorageService $entityStorage,
        private DataPathResolver $dataPathResolver,
        private SupportEntityTypesService $supportEntityTypesService,
    ) {
    }

    private function resolvePath(?string $repoName, ?string $branch, ?string $type = null): string
    {
        try {
            if ($type !== null) {
                $type = $this->supportEntityTypesService->assertSupported($type);
            }
            return $this->dataPathResolver->resolve($repoName, $branch, $type);
        } catch (\InvalidArgumentException $e) {
            abort(400, $e->getMessage());
        }
    }

    /**
     * @OA\Get(
     *     path="/api/v1/{repoName}/{branch}/entities/{type}",
     *     operationId="listEntitiesRepoBranch",
     *     tags={"Entity"},
     *     summary="List entities",
     *     description="Returns a list of entities from /data/{repoName}/{branch}. Optional query filters (AND combined): filterDisplayName, filterTechnicalSuitability, filterFunctionalSuitability, filterRelApplicationToBusinessCapability, filterRelApplicationToUserGroup, filterRelApplicationToProject, filterRelApplicationToDataProduct, filterRelApplicationToPlatform, filterPlatformTEMP. Use repoName=local, branch=default for default data.",
     *     @OA\Parameter(name="repoName", in="path", required=true, description="Repository name (segment under data root)", @OA\Schema(type="string")),
     *     @OA\Parameter(name="branch", in="path", required=true, description="Branch name (segment under repo)", @OA\Schema(type="string")),
     *     @OA\Parameter(name="type", in="path", required=true, description="Entity type (e.g. Application)", @OA\Schema(type="string")),
     *     @OA\Parameter(name="filterDisplayName", in="query", required=false, @OA\Schema(type="string")),
     *     @OA\Parameter(name="filterTechnicalSuitability", in="query", required=false, @OA\Schema(type="string")),
     *     @OA\Parameter(name="filterFunctionalSuitability", in="query", required=false, @OA\Schema(type="string")),
     *     @OA\Parameter(name="filterRelApplicationToBusinessCapability", in="query", required=false, @OA\Schema(type="string")),
     *     @OA\Parameter(name="filterRelApplicationToUserGroup", in="query", required=false, @OA\Schema(type="string")),
     *     @OA\Parameter(name="filterRelApplicationToProject", in="query", required=false, @OA\Schema(type="string")),
     *     @OA\Parameter(name="filterRelApplicationToDataProduct", in="query", required=false, @OA\Schema(type="string")),
     *     @OA\Parameter(name="filterRelApplicationToPlatform", in="query", required=false, @OA\Schema(type="string")),
     *     @OA\Parameter(name="filterPlatformTEMP", in="query", required=false, @OA\Schema(type="string")),
     *     @OA\Response(response="200", description="List of entities", @OA\JsonContent(type="array", @OA\Items(type="object"))),
     * )
     */
    public function listEntities(Request $request, string $repoName, string $branch, ?string $type = null): JsonResponse
    {
        $filters = array_filter([
            'filterDisplayName' => $request->query('filterDisplayName'),
            'filterTechnicalSuitability' => $request->query('filterTechnicalSuitability'),
            'filterFunctionalSuitability' => $request->query('filterFunctionalSuitability'),
            'filterRelApplicationToBusinessCapability' => $request->query('filterRelApplicationToBusinessCapability'),
            'filterRelApplicationToUserGroup' => $request->query('filterRelApplicationToUserGroup'),
            'filterRelApplicationToProject' => $request->query('filterRelApplicationToProject'),
            'filterRelApplicationToDataProduct' => $request->query('filterRelApplicationToDataProduct'),
            'filterRelApplicationToPlatform' => $request->query('filterRelApplicationToPlatform'),
            'filterPlatformTEMP' => $request->query('filterPlatformTEMP'),
        ], fn ($v) => $v !== null && $v !== '');

        if ($type === null) {
            $entities = [];
            foreach ($this->supportEntityTypesService->all() as $t) {
                $path = $this->resolvePath($repoName, $branch, $t);
                $entities = array_merge($entities, $this->entityStorage->listEntities($filters, $path));
            }
        } else {
            $path = $this->resolvePath($repoName, $branch, $type);
            $entities = $this->entityStorage->listEntities($filters, $path);
        }

        return response()->json($entities);
    }

    /**
     * @OA\Get(
     *     path="/api/v1/{repoName}/{branch}/entity/{type}/{guid}",
     *     operationId="getEntityRepoBranch",
     *     tags={"Entity"},
     *     summary="Get entity by GUID",
     *     description="Returns the latest version of the entity from /data/{repoName}/{branch}. 404 if not found. Use repoName=local, branch=default for default data.",
     *     @OA\Parameter(name="repoName", in="path", required=true, description="Repository name", @OA\Schema(type="string")),
     *     @OA\Parameter(name="branch", in="path", required=true, description="Branch name", @OA\Schema(type="string")),
     *     @OA\Parameter(name="type", in="path", required=true, description="Entity type (e.g. Application)", @OA\Schema(type="string")),
     *     @OA\Parameter(name="guid", in="path", required=true, @OA\Schema(type="string", format="uuid")),
     *     @OA\Response(response="200", description="Entity", @OA\JsonContent()),
     *     @OA\Response(response="404", description="Not found", @OA\JsonContent()),
     *     @OA\Response(response="400", description="Bad Request", @OA\JsonContent()),
     * )
     */
    public function getEntityRepoBranch(string $repoName, string $branch, string $type, string $guid): JsonResponse
    {
        $guid = trim($guid);
        if (! $this->entityStorage->isValidGuid($guid)) {
            Log::warning('Entity API invalid GUID format', ['guid' => $guid, 'length' => strlen($guid), 'endpoint' => 'getEntityRepoBranch']);

            return response()->json(['message' => 'Invalid GUID format.'], Response::HTTP_BAD_REQUEST);
        }

        $path = $this->resolvePath($repoName, $branch, $type);
        return $this->getEntityByPath($guid, $path);
    }

    private function getEntityByPath(string $guid, string $path): JsonResponse
    {
        $data = $this->entityStorage->get($guid, $path);
        if ($data === null) {
            throw new NotFoundHttpException('Entity not found.');
        }

        return response()->json($data);
    }

    /**
     * @OA\Put(
     *     path="/api/v1/{repoName}/{branch}/entity/{type}/{guid}",
     *     operationId="putEntityRepoBranch",
     *     tags={"Entity"},
     *     summary="Create or update entity",
     *     description="Stores or replaces the entity JSON in /data/{repoName}/{branch}. Body must be valid JSON object. Use repoName=local, branch=default for default data.",
     *     @OA\Parameter(name="repoName", in="path", required=true, @OA\Schema(type="string")),
     *     @OA\Parameter(name="branch", in="path", required=true, @OA\Schema(type="string")),
     *     @OA\Parameter(name="type", in="path", required=true, description="Entity type (e.g. Application)", @OA\Schema(type="string")),
     *     @OA\Parameter(name="guid", in="path", required=true, @OA\Schema(type="string", format="uuid")),
     *     @OA\RequestBody(required=true, @OA\JsonContent()),
     *     @OA\Response(response="200", description="Entity saved", @OA\JsonContent()),
     *     @OA\Response(response="400", description="Bad Request", @OA\JsonContent()),
     * )
     */
    public function putEntityRepoBranch(Request $request, string $repoName, string $branch, string $type, string $guid): JsonResponse
    {
        $guid = trim($guid);
        if (! $this->entityStorage->isValidGuid($guid)) {
            Log::warning('Entity API invalid GUID format', ['guid' => $guid, 'length' => strlen($guid), 'endpoint' => 'putEntityRepoBranch']);

            return response()->json(['message' => 'Invalid GUID format.'], Response::HTTP_BAD_REQUEST);
        }

        $path = $this->resolvePath($repoName, $branch, $type);
        return $this->putEntityByPath($request, $guid, $path);
    }

    /**
     * @OA\Post(
     *     path="/api/v1/{repoName}/{branch}/entity/{type}/{guid}",
     *     operationId="postEntityRepoBranch",
     *     tags={"Entity"},
     *     summary="Create or update entity (POST alias)",
     *     description="Same semantics as PUT: Stores or replaces the entity JSON in /data/{repoName}/{branch}/{type}.",
     *     @OA\Parameter(name="repoName", in="path", required=true, @OA\Schema(type="string")),
     *     @OA\Parameter(name="branch", in="path", required=true, @OA\Schema(type="string")),
     *     @OA\Parameter(name="type", in="path", required=true, description="Entity type (e.g. Application)", @OA\Schema(type="string")),
     *     @OA\Parameter(name="guid", in="path", required=true, @OA\Schema(type="string", format="uuid")),
     *     @OA\RequestBody(required=true, @OA\JsonContent()),
     *     @OA\Response(response="200", description="Entity saved", @OA\JsonContent())
     * )
     */
    public function postEntityRepoBranch(Request $request, string $repoName, string $branch, string $type, string $guid): JsonResponse
    {
        // Validate GUID + delegate to PUT implementation.
        $guid = trim($guid);
        if (! $this->entityStorage->isValidGuid($guid)) {
            Log::warning('Entity API invalid GUID format', ['guid' => $guid, 'length' => strlen($guid), 'endpoint' => 'postEntityRepoBranch']);

            return response()->json(['message' => 'Invalid GUID format.'], Response::HTTP_BAD_REQUEST);
        }

        $path = $this->resolvePath($repoName, $branch, $type);
        return $this->putEntityByPath($request, $guid, $path);
    }

    private function putEntityByPath(Request $request, string $guid, string $path): JsonResponse
    {
        $data = $request->all();
        if (! is_array($data)) {
            return response()->json(['message' => 'Request body must be a JSON object.'], Response::HTTP_BAD_REQUEST);
        }

        try {
            $this->entityStorage->put($guid, $data, $path);
        } catch (\JsonException $e) {
            return response()->json(['message' => 'Invalid JSON in request body.'], Response::HTTP_BAD_REQUEST);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], Response::HTTP_BAD_REQUEST);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => 'Failed to save entity.'], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        return response()->json($data);
    }

    /**
     * @OA\Patch(
     *     path="/api/v1/{repoName}/{branch}/entity/{type}/{guid}",
     *     operationId="patchEntityRepoBranch",
     *     tags={"Entity"},
     *     summary="Partially update entity",
     *     description="Partially update entity in /data/{repoName}/{branch}. If the entity file does not exist, creates it with the payload. Returns 204 No Content on success. Use repoName=local, branch=default for default data.",
     *     @OA\Parameter(name="repoName", in="path", required=true, @OA\Schema(type="string")),
     *     @OA\Parameter(name="branch", in="path", required=true, @OA\Schema(type="string")),
     *     @OA\Parameter(name="type", in="path", required=true, description="Entity type (e.g. Application)", @OA\Schema(type="string")),
     *     @OA\Parameter(name="guid", in="path", required=true, @OA\Schema(type="string", format="uuid")),
     *     @OA\RequestBody(required=true, @OA\JsonContent()),
     *     @OA\Response(response="204", description="Updated"),
     *     @OA\Response(response="400", description="Bad Request", @OA\JsonContent()),
     * )
     */
    public function patchEntityRepoBranch(Request $request, string $repoName, string $branch, string $type, string $guid): JsonResponse|Response
    {
        $guid = trim($guid);
        if (! $this->entityStorage->isValidGuid($guid)) {
            Log::warning('Entity API invalid GUID format', ['guid' => $guid, 'length' => strlen($guid), 'endpoint' => 'patchEntityRepoBranch']);

            return response()->json(['message' => 'Invalid GUID format.'], Response::HTTP_BAD_REQUEST);
        }

        $path = $this->resolvePath($repoName, $branch, $type);
        return $this->patchEntityByPath($request, $guid, $path);
    }

    private function patchEntityByPath(Request $request, string $guid, string $path): JsonResponse|Response
    {
        $payload = $request->all();
        if (! is_array($payload)) {
            return response()->json(['message' => 'Request body must be a JSON object.'], Response::HTTP_BAD_REQUEST);
        }

        try {
            $existing = $this->entityStorage->get($guid, $path);
            if ($existing === null) {
                $data = [];
                foreach ($payload as $key => $value) {
                    if ($value !== 'undefined') {
                        $data[$key] = $value;
                    }
                }
                $this->entityStorage->put($guid, $data, $path);
                return response()->noContent();
            }

            foreach ($payload as $key => $value) {
                if ($value === 'undefined') {
                    unset($existing[$key]);
                } else {
                    $existing[$key] = $value;
                }
            }
            $this->entityStorage->put($guid, $existing, $path);
        } catch (\JsonException $e) {
            return response()->json(['message' => 'Invalid JSON in request body.'], Response::HTTP_BAD_REQUEST);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], Response::HTTP_BAD_REQUEST);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => 'Failed to save entity.'], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        return response()->noContent();
    }

    /**
     * @OA\Delete(
     *     path="/api/v1/{repoName}/{branch}/entity/{type}/{guid}",
     *     operationId="deleteEntityRepoBranch",
     *     tags={"Entity"},
     *     summary="Delete entity",
     *     description="Soft-deletes the entity in /data/{repoName}/{branch}. 404 if not found. Use repoName=local, branch=default for default data.",
     *     @OA\Parameter(name="repoName", in="path", required=true, @OA\Schema(type="string")),
     *     @OA\Parameter(name="branch", in="path", required=true, @OA\Schema(type="string")),
     *     @OA\Parameter(name="type", in="path", required=true, description="Entity type (e.g. Application)", @OA\Schema(type="string")),
     *     @OA\Parameter(name="guid", in="path", required=true, @OA\Schema(type="string", format="uuid")),
     *     @OA\Response(response="204", description="Deleted"),
     *     @OA\Response(response="404", description="Not found", @OA\JsonContent()),
     *     @OA\Response(response="400", description="Bad Request", @OA\JsonContent()),
     * )
     */
    public function deleteEntityRepoBranch(string $repoName, string $branch, string $type, string $guid): JsonResponse|Response
    {
        $guid = trim($guid);
        if (! $this->entityStorage->isValidGuid($guid)) {
            Log::warning('Entity API invalid GUID format', ['guid' => $guid, 'length' => strlen($guid), 'endpoint' => 'deleteEntityRepoBranch']);

            return response()->json(['message' => 'Invalid GUID format.'], Response::HTTP_BAD_REQUEST);
        }

        $path = $this->resolvePath($repoName, $branch, $type);
        return $this->deleteEntityByPath($guid, $path);
    }

    private function deleteEntityByPath(string $guid, string $path): JsonResponse|Response
    {
        $deleted = $this->entityStorage->delete($guid, $path);
        if (! $deleted) {
            throw new NotFoundHttpException('Entity not found.');
        }

        return response()->noContent();
    }
}
