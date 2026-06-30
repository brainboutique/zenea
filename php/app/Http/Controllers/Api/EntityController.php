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
use App\Services\RoleEvaluationService;
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
        private RoleEvaluationService $roleEvaluation,
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
            'filterParents' => $request->query('filterParents'),
        ], fn ($v) => $v !== null && $v !== '');

        $username = $request->attributes->get('auth_email');
        $authMode = $request->attributes->get('auth_mode');
        $hasAttributeRestrictions = $username !== null && $authMode !== 'none' && $authMode !== null;

        if ($type === null) {
            $entities = [];
            foreach ($this->supportEntityTypesService->all() as $t) {
                $path = $this->resolvePath($repoName, $branch, $t);
                $entities = array_merge($entities, $this->entityStorage->listEntities($filters, $path, $t));
            }
        } else {
            $path = $this->resolvePath($repoName, $branch, $type);
            $entities = $this->entityStorage->listEntities($filters, $path, $type);
        }

        $readableUnion = null;
        $writableUnion = null;

        if ($hasAttributeRestrictions) {
            $entities = array_map(function ($entity) use ($username, $repoName, $branch, &$readableUnion, &$writableUnion) {
                $entityType = $entity['type'] ?? 'Unknown';
                $readable = $this->roleEvaluation->getReadAttributes($username, $repoName, $branch, $entityType);
                $writable = $this->roleEvaluation->getWritableAttributes($username, $repoName, $branch, $entityType);

                if ($readable !== null) {
                    $readableUnion = $readableUnion === null ? $readable : array_values(array_unique(array_merge($readableUnion, $readable)));
                }
                if ($writable !== null) {
                    $writableUnion = $writableUnion === null ? $writable : array_values(array_unique(array_merge($writableUnion, $writable)));
                }

                return $this->roleEvaluation->filterEntityForRead($entity, $readable);
            }, $entities);
        }

        $response = response()->json($entities);

        if ($readableUnion !== null) {
            $response->headers->set('X-Readable-Attributes', implode(',', $readableUnion));
        }
        if ($writableUnion !== null) {
            $response->headers->set('X-Writable-Attributes', implode(',', $writableUnion));
        }

        return $response;
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
    public function getEntityRepoBranch(Request $request, string $repoName, string $branch, string $type, string $guid): JsonResponse
    {
        $guid = trim($guid);
        if (! $this->entityStorage->isValidGuid($guid)) {
            Log::warning('Entity API invalid GUID format', ['guid' => $guid, 'length' => strlen($guid), 'endpoint' => 'getEntityRepoBranch']);

            return response()->json(['message' => 'Invalid GUID format.'], Response::HTTP_BAD_REQUEST);
        }

        $path = $this->resolvePath($repoName, $branch, $type);
        return $this->getEntityByPath($request, $guid, $path, $repoName, $branch, $type);
    }

    private function getEntityByPath(Request $request, string $guid, string $path, string $repoName, string $branch, string $type): JsonResponse
    {
        $data = $this->entityStorage->get($guid, $path);
        if ($data === null) {
            throw new NotFoundHttpException('Entity not found.');
        }

        $username = $request->attributes->get('auth_email');
        $authMode = $request->attributes->get('auth_mode');
        $response = response()->json($data);

        if ($username !== null && $authMode !== 'none' && $authMode !== null) {
            $readable = $this->roleEvaluation->getReadAttributes($username, $repoName, $branch, $type);
            $writable = $this->roleEvaluation->getWritableAttributes($username, $repoName, $branch, $type);

            $data = $this->roleEvaluation->filterEntityForRead($data, $readable);
            $response = response()->json($data);

            if ($readable !== null) {
                $response->headers->set('X-Readable-Attributes', implode(',', $readable));
            }
            if ($writable !== null) {
                $response->headers->set('X-Writable-Attributes', implode(',', $writable));
            }
        }

        return $response;
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

        $writeCheck = $this->validateWriteAttributes($request, $repoName, $branch, $type);
        if ($writeCheck !== null) {
            return $writeCheck;
        }

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
        $guid = trim($guid);
        if (! $this->entityStorage->isValidGuid($guid)) {
            Log::warning('Entity API invalid GUID format', ['guid' => $guid, 'length' => strlen($guid), 'endpoint' => 'postEntityRepoBranch']);

            return response()->json(['message' => 'Invalid GUID format.'], Response::HTTP_BAD_REQUEST);
        }

        $path = $this->resolvePath($repoName, $branch, $type);

        $writeCheck = $this->validateWriteAttributes($request, $repoName, $branch, $type);
        if ($writeCheck !== null) {
            return $writeCheck;
        }

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

        $writeCheck = $this->validateWriteAttributes($request, $repoName, $branch, $type);
        if ($writeCheck !== null) {
            return $writeCheck;
        }

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

    private function validateWriteAttributes(Request $request, string $repoName, string $branch, string $type): ?JsonResponse
    {
        $username = $request->attributes->get('auth_email');
        $authMode = $request->attributes->get('auth_mode');
        if ($username === null || $authMode === 'none' || $authMode === null) {
            return null;
        }

        $data = $request->all();
        if (! is_array($data)) {
            return null;
        }

        $denied = $this->roleEvaluation->checkWriteAttributes($username, $repoName, $branch, $type, array_keys($data));
        if ($denied === null || empty($denied)) {
            return null;
        }

        $writable = $this->roleEvaluation->getWritableAttributes($username, $repoName, $branch, $type);
        $readable = $this->roleEvaluation->getReadAttributes($username, $repoName, $branch, $type);

        $response = response()->json([
            'message' => 'Write denied for attributes: ' . implode(', ', $denied),
            'deniedAttributes' => $denied,
        ], Response::HTTP_FORBIDDEN);

        if ($readable !== null) {
            $response->headers->set('X-Readable-Attributes', implode(',', $readable));
        }
        if ($writable !== null) {
            $response->headers->set('X-Writable-Attributes', implode(',', $writable));
        }

        return $response;
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
    public function deleteEntityRepoBranch(Request $request, string $repoName, string $branch, string $type, string $guid): JsonResponse|Response
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
