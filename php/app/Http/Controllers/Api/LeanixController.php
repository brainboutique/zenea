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
use App\Services\GitService;
use App\Services\LeanixService;
use App\Services\RoleEvaluationService;
use App\Services\SupportEntityTypesService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class LeanixController extends Controller
{
    public function __construct(
        private readonly LeanixService $leanix,
        private DataPathResolver $dataPathResolver,
        private GitService $gitService,
        private EntityStorageService $entityStorage,
        private SupportEntityTypesService $supportEntityTypesService,
        private RoleEvaluationService $roleEvaluation
    ) {
    }

    /**
     * Get all unique 1st-level attribute keys for a given entity type from local JSON files.
     *
     * @OA\Get(
     *     path="/api/v1/{repoName}/{branch}/leanix/attributes/{type}",
     *     operationId="leanixGetAttributeKeys",
     *     tags={"LeanIX"},
     *     summary="Get entity attribute keys",
     *     description="Returns all unique 1st-level attribute keys found in local JSON files for the given entity type.",
     *     @OA\Parameter(name="repoName", in="path", required=true, @OA\Schema(type="string")),
     *     @OA\Parameter(name="branch", in="path", required=true, @OA\Schema(type="string")),
     *     @OA\Parameter(name="type", in="path", required=true, description="Entity type (e.g. Application)", @OA\Schema(type="string")),
     *     @OA\Response(response="200", description="Sorted list of unique attribute keys", @OA\JsonContent(type="array", @OA\Items(type="string"))),
     * )
     */
    public function getAttributeKeys(string $repoName, string $branch, string $type): JsonResponse
    {
        try {
            $type = $this->supportEntityTypesService->assertSupported($type);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 400);
        }

        $dataPath = $this->dataPathResolver->resolve($repoName, $branch, $type);
        $keys = $this->entityStorage->getUniqueAttributeKeys($type, $dataPath);

        return response()->json($keys);
    }

    /**
     * Slurp LeanIX applications: fetch count of Application fact sheets (no payload data).
     *
     * This is a backend proxy for the frontend \"Slurp LeanIX\" dialog so that we can
     * attach the required Cookie header, which browsers do not allow JavaScript to set directly.
     *
     * @OA\Post(
     *     path="/api/v1/{repoName}/{branch}/leanix/slurp",
     *     operationId="leanixSlurp",
     *     tags={"LeanIX"},
     *     summary="Slurp LeanIX application count",
     *     description="Fetch count of Application fact sheets from LeanIX. Does not return payload data; only the status with app count.",
     *     @OA\Parameter(name="repoName", in="path", required=true, description="Repository name (unused, for routing symmetry)", @OA\Schema(type="string")),
     *     @OA\Parameter(name="branch", in="path", required=true, description="Branch name (unused, for routing symmetry)", @OA\Schema(type="string")),
     *     @OA\RequestBody(required=true, @OA\JsonContent(
     *         required={"baseUrl","bearerToken","cookies"},
     *         @OA\Property(property="baseUrl", type="string", example="https://demo.leanix.net"),
     *         @OA\Property(property="bearerToken", type="string", example="Bearer eyJ..."),
     *         @OA\Property(property="cookies", type="string", example="lxRegion=eu; _shibsession_...=...")
     *     )),
     *     @OA\Response(
     *         response="200",
     *         description="Slurp result (app count only)",
     *         @OA\JsonContent(
     *             @OA\Property(property="total", type="integer", description="Number of applications slurped")
     *         )
     *     ),
     *     @OA\Response(response="400", description="Validation error"),
     *     @OA\Response(response="500", description="Error talking to LeanIX")
     * )
     */
    public function slurp(Request $request, string $repoName, string $branch): JsonResponse
    {
        // set_time_limit after parsing requested fact sheet types

        $baseUrl = $request->input('baseUrl');
        $bearerToken = $request->input('bearerToken');
        $cookies = $request->input('cookies');

        if (!is_string($baseUrl) || trim($baseUrl) === '') {
            return response()->json(['message' => 'baseUrl is required and must be a non-empty string'], 400);
        }
        if (!is_string($bearerToken) || trim($bearerToken) === '') {
            return response()->json(['message' => 'bearerToken is required and must be a non-empty string'], 400);
        }
        if (!is_string($cookies) || trim($cookies) === '') {
            return response()->json(['message' => 'cookies is required and must be a non-empty string'], 400);
        }

        $ignoreAttributesRaw = $request->input('ignoreAttributes');
        $ignoreAttributes = [];
        if (is_string($ignoreAttributesRaw) && trim($ignoreAttributesRaw) !== '') {
            $ignoreAttributes = array_flip(array_map('trim', explode(',', $ignoreAttributesRaw)));
            $ignoreAttributes = array_filter($ignoreAttributes, static fn ($k) => $k !== '', ARRAY_FILTER_USE_KEY);
        }

        $typesRaw = $request->input('types');
        $types = [];
        if ($typesRaw === null || (is_string($typesRaw) && trim($typesRaw) === '')) {
            $types = ['Application'];
        } else {
            if (! is_string($typesRaw)) {
                return response()->json(['message' => 'types must be a comma-separated string (or omitted to default to Application)'], 400);
            }

            $parts = array_map(static fn ($p) => trim((string) $p), explode(',', $typesRaw));
            $parts = array_values(array_filter($parts, static fn ($p) => $p !== ''));

            $allowed = ['Application', 'Tag', 'TagGroup', 'UserGroup', 'BusinessCapability', 'Platform', 'ITComponent'];
            $seen = [];
            foreach ($parts as $t) {
                if (! in_array($t, $allowed, true)) {
                    return response()->json(['message' => 'Unsupported type: ' . $t], 400);
                }
                if (isset($seen[$t])) {
                    continue;
                }
                $seen[$t] = true;
                $types[] = $t;
            }

            if ($types === []) {
                $types = ['Application'];
            }
        }

        set_time_limit(300 * max(1, count($types))); // 5 min per type

        $baseUrl = rtrim(trim($baseUrl), '/');
        $token = trim($bearerToken);
        if (!str_starts_with($token, 'Bearer ')) {
            $token = 'Bearer ' . $token;
        }

        try {
            $total = 0;
            $stored = 0;
            $byType = [];
            foreach ($types as $type) {
                $entities = $this->leanix->fetchAllFactSheetIds($baseUrl, $token, $cookies, $type);
                $typeTotal = count($entities);

                $typeStored = 0;
                $writtenFiles = [];

                $baseDir = $this->dataPathResolver->resolve($repoName, $branch, $type);
                if (!is_dir($baseDir) && !mkdir($baseDir, 0775, true) && !is_dir($baseDir)) {
                    throw new \RuntimeException('Failed to create directory: ' . $baseDir);
                }

                $total += $typeTotal;

                $ids = [];
                foreach ($entities as $entity) {
                    if (isset($entity['id']) && $entity['id'] !== '') {
                        $ids[] = $entity['id'];
                    }
                }
                unset($entities);

                $autoRemoveDeleted = (bool) $request->input('autoRemoveDeleted', false);
                $leanixIdSet = array_flip($ids);
                $existingFiles = is_dir($baseDir) ? glob($baseDir . DIRECTORY_SEPARATOR . '*.json') : [];
                foreach ($existingFiles as $filePath) {
                    $localId = basename($filePath, '.json');
                    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $localId)) {
                        continue;
                    }
                    if (!isset($leanixIdSet[$localId])) {
                        if ($autoRemoveDeleted) {
                            @unlink($filePath);
                        }
                    }
                }

                $batchSize = 50;
                foreach (array_chunk($ids, $batchSize) as $idBatch) {
                    $batchRequests = [];
                    foreach ($idBatch as $id) {
                        $batchRequests[] = ['id' => $id, 'type' => $type];
                    }

                    $parallelResults = $this->leanix->fetchFactSheetsParallel($baseUrl, $token, $cookies, $batchRequests);

                    foreach ($idBatch as $id) {
                        $leanixData = $parallelResults[$id] ?? null;
                        if ($leanixData === null) {
                            continue;
                        }

                        $leanixData = $this->entityStorage->normalizeEntityData($leanixData);
                        $filePath = $baseDir . DIRECTORY_SEPARATOR . $id . '.json';

                        $existingData = [];
                        if (is_file($filePath)) {
                            $raw = @file_get_contents($filePath);
                            if ($raw !== false) {
                                $decoded = json_decode($raw, true);
                                if (is_array($decoded)) {
                                    $existingData = $decoded;
                                }
                            }
                        }

                        if ($existingData === []) {
                            $merged = $leanixData;
                            if (isset($merged['lxTimeClassification']) && is_string($merged['lxTimeClassification'])) {
                                $merged['lxTimeClassification'] = strtolower($merged['lxTimeClassification']);
                            }
                        } else {
                            $merged = $existingData;
                            foreach ($leanixData as $field => $value) {
                                if (isset($ignoreAttributes[$field])) {
                                    continue;
                                }
                                if ($field === 'lxTimeClassification' && is_string($value)) {
                                    $value = strtolower($value);
                                }
                                $localValue = $merged[$field] ?? null;
                                $leanixEmpty = $value === null || $value === '';
                                $localEmpty = $localValue === null || $localValue === '';
                                if ($leanixEmpty && $localEmpty) {
                                    continue;
                                }
                                $merged[$field] = $value;
                            }
                        }

                        file_put_contents(
                            $filePath,
                            json_encode($merged, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
                            LOCK_EX
                        );
                        $typeStored++;
                        $stored++;
                        $writtenFiles[] = $filePath;
                    }

                    unset($parallelResults, $batchRequests);
                }
                unset($ids);

                $this->gitService->addPathsIfUnderGit($baseDir, $writtenFiles);
                $byType[$type] = [
                    'total' => $typeTotal,
                    'stored' => $typeStored,
                ];
            }

            $this->roleEvaluation->invalidateAttributeCache();

            return response()->json([
                'total' => $total,
                'stored' => $stored,
                'byType' => $byType,
            ]);
        } catch (\Throwable $e) {
            Log::warning("Error received from remote LeanIX ".$e->getMessage());

            return response()->json([
                'message' => 'Failed to talk to LeanIX: ' . $e->getMessage(),
            ], 500);
        }
    }
}

