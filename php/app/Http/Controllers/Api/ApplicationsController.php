<?php

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
