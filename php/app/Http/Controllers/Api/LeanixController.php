<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DataPathResolver;
use App\Services\EntityStorageService;
use App\Services\GitService;
use App\Services\LeanixService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeanixController extends Controller
{
    public function __construct(
        private readonly LeanixService $leanix,
        private DataPathResolver $dataPathResolver,
        private GitService $gitService,
        private EntityStorageService $entityStorage
    ) {
    }

    /**
     * Slurp LeanIX applications: fetch count of Application fact sheets (no payload data).
     *
     * This is a backend proxy for the frontend \"Slurp LeanIX\" dialog so that we can
     * attach the required Cookie header, which browsers do not allow JavaScript to set directly.
     *
     * @OA\Post(
     *     path=\"/api/v1/{repoName}/{branch}/leanix/slurp\",
     *     operationId=\"leanixSlurp\",
     *     tags={\"LeanIX\"},
     *     summary=\"Slurp LeanIX application count\",
     *     description=\"Fetch count of Application fact sheets from LeanIX. Does not return payload data; only the status with app count.\",
     *     @OA\Parameter(name=\"repoName\", in=\"path\", required=true, description=\"Repository name (unused, for routing symmetry)\", @OA\Schema(type=\"string\")),
     *     @OA\Parameter(name=\"branch\", in=\"path\", required=true, description=\"Branch name (unused, for routing symmetry)\", @OA\Schema(type=\"string\")),
     *     @OA\RequestBody(required=true, @OA\JsonContent(
     *         required={\"baseUrl\",\"bearerToken\",\"cookies\"},
     *         @OA\Property(property=\"baseUrl\", type=\"string\", example=\"https://demo.leanix.net\"),
     *         @OA\Property(property=\"bearerToken\", type=\"string\", example=\"Bearer eyJ..."),
     *         @OA\Property(property=\"cookies\", type=\"string\", example=\"lxRegion=eu; _shibsession_...=...\")
     *     )),
     *     @OA\Response(
     *         response=\"200\",
     *         description=\"Slurp result (app count only)\",
     *         @OA\JsonContent(
     *             @OA\Property(property=\"total\", type=\"integer\", description=\"Number of applications slurped\")
     *         )
     *     ),
     *     @OA\Response(response=\"400\", description=\"Validation error\"),
     *     @OA\Response(response=\"500\", description=\"Error talking to LeanIX\")
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

            $allowed = ['Application', 'UserGroup', 'BusinessCapability', 'Platform', 'ITComponent'];
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

                foreach ($entities as $entity) {
                    $id = isset($entity['id']) && $entity['id'] !== '' ? (string) $entity['id'] : null;
                    if ($id === null) {
                        continue;
                    }

                    error_log("Slurping {$type} " . $id);
                    $payload = $this->leanix->fetchFactSheet($baseUrl, $token, $cookies, $type, $id);
                    if ($payload !== null && is_array($payload)) {
                        $payload = $this->entityStorage->normalizeEntityData($payload);
                        $filePath = $baseDir . DIRECTORY_SEPARATOR . $id . '.json';
                        file_put_contents(
                            $filePath,
                            json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
                            LOCK_EX
                        );
                        $typeStored++;
                        $stored++;
                        $writtenFiles[] = $filePath;
                    }
                }

                $this->gitService->addPathsIfUnderGit($baseDir, $writtenFiles);
                $byType[$type] = [
                    'total' => $typeTotal,
                    'stored' => $typeStored,
                ];
            }

            return response()->json([
                'total' => $total,
                'stored' => $stored,
                'byType' => $byType,
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Failed to talk to LeanIX: ' . $e->getMessage(),
            ], 500);
        }
    }
}

