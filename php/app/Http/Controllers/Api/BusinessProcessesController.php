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
use App\Services\BusinessProcessesService;
use App\Services\DataPathResolver;
use App\Services\KpiScheduler;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class BusinessProcessesController extends Controller
{
    public function __construct(
        private BusinessProcessesService $businessProcesses,
        private DataPathResolver $dataPathResolver,
        private KpiScheduler $kpiScheduler,
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
     *     path="/api/v1/{repoName}/{branch}/business-processes",
     *     operationId="getBusinessProcessesRepoBranch",
     *     tags={"BusinessProcesses"},
     *     summary="Get business processes document",
     *     description="Returns the list of business processes from /data/{repoName}/{branch}/Process. Use repoName=local, branch=default for default data.",
     *     @OA\Parameter(name="repoName", in="path", required=true, description="Repository name", @OA\Schema(type="string")),
     *     @OA\Parameter(name="branch", in="path", required=true, description="Branch name", @OA\Schema(type="string")),
     *     @OA\Response(response="200", description="Business processes document", @OA\JsonContent()),
     * )
     */
    public function getBusinessProcesses(string $repoName, string $branch): JsonResponse
    {
        $path = $this->resolvePath($repoName, $branch);
        $data = $this->businessProcesses->getCached($path);

        return response()->json($data);
    }

    /**
     * @OA\Get(
     *     path="/api/v1/{repoName}/{branch}/business-process/{guid}",
     *     operationId="getBusinessProcessRepoBranch",
     *     tags={"BusinessProcesses"},
     *     summary="Get business process by GUID",
     *     description="Returns the full business process data from /data/{repoName}/{branch}/Process/{guid}.json. 404 if not found.",
     *     @OA\Parameter(name="repoName", in="path", required=true, description="Repository name", @OA\Schema(type="string")),
     *     @OA\Parameter(name="branch", in="path", required=true, description="Branch name", @OA\Schema(type="string")),
     *     @OA\Parameter(name="guid", in="path", required=true, @OA\Schema(type="string")),
     *     @OA\Response(response="200", description="Business process", @OA\JsonContent()),
     *     @OA\Response(response="404", description="Not found", @OA\JsonContent()),
     * )
     */
    public function getBusinessProcess(string $repoName, string $branch, string $guid): JsonResponse
    {
        $guid = trim($guid);
        $path = $this->resolvePath($repoName, $branch);
        $data = $this->businessProcesses->get($guid, $path);

        if ($data === null) {
            throw new NotFoundHttpException('Business process not found.');
        }

        return response()->json($data);
    }

    /**
     * @OA\Put(
     *     path="/api/v1/{repoName}/{branch}/business-process/{guid}",
     *     operationId="putBusinessProcessRepoBranch",
     *     tags={"BusinessProcesses"},
     *     summary="Create or update business process",
     *     description="Stores or replaces the business process JSON in /data/{repoName}/{branch}/Process/{guid}.json. Body must be valid JSON object.",
     *     @OA\Parameter(name="repoName", in="path", required=true, @OA\Schema(type="string")),
     *     @OA\Parameter(name="branch", in="path", required=true, @OA\Schema(type="string")),
     *     @OA\Parameter(name="guid", in="path", required=true, @OA\Schema(type="string")),
     *     @OA\RequestBody(required=true, @OA\JsonContent()),
     *     @OA\Response(response="200", description="Business process saved", @OA\JsonContent()),
     *     @OA\Response(response="400", description="Bad Request", @OA\JsonContent()),
     * )
     */
    public function updateBusinessProcess(Request $request, string $repoName, string $branch, string $guid): JsonResponse
    {
        $guid = trim($guid);
        $data = $request->all();

        if (! is_array($data)) {
            return response()->json(['message' => 'Request body must be a JSON object.'], Response::HTTP_BAD_REQUEST);
        }

        $path = $this->resolvePath($repoName, $branch);
        $username = $request->attributes->get('auth_email');

        try {
            $this->businessProcesses->put($guid, $data, $path, $username);
        } catch (\JsonException $e) {
            return response()->json(['message' => 'Invalid JSON in request body.'], Response::HTTP_BAD_REQUEST);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], Response::HTTP_BAD_REQUEST);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => 'Failed to save business process.'], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        $data['id'] = $guid;

        app()->terminating(fn () => $this->kpiScheduler->markDirty($repoName, $branch));

        return response()->json($data);
    }
}
