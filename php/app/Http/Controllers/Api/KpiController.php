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
use App\Services\KpiScheduler;
use App\Services\KpiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class KpiController extends Controller
{
    public function __construct(
        private KpiService $kpiService,
        private KpiScheduler $kpiScheduler,
    ) {
    }

    /**
     * @OA\Get(
     *     path="/api/v1/{repoName}/{branch}/history/KPIs",
     *     operationId="getHistoryKpis",
     *     tags={"KPIs"},
     *     summary="Get KPI history",
     *     description="Returns all daily KPI snapshots from /data/{repoName}/{branch}/_History. If captureNow query param is set, first re-computes KPIs for the current data state.",
     *     @OA\Parameter(name="repoName", in="path", required=true, description="Repository name", @OA\Schema(type="string")),
     *     @OA\Parameter(name="branch", in="path", required=true, description="Branch name", @OA\Schema(type="string")),
     *     @OA\Parameter(name="captureNow", in="query", required=false, description="If set, force KPI capture before returning history", @OA\Schema(type="string")),
     *     @OA\Response(response="200", description="KPI history", @OA\JsonContent()),
     * )
     */
    public function getHistory(Request $request, string $repoName, string $branch): JsonResponse
    {
        if ($request->has('captureNow')) {
            $this->kpiService->capture($repoName, $branch);
            $this->kpiScheduler->clearDirty($repoName, $branch);
        } elseif ($this->kpiScheduler->shouldCapture($repoName, $branch)) {
            $this->kpiService->capture($repoName, $branch);
            $this->kpiScheduler->clearDirty($repoName, $branch);
        }

        $history = $this->kpiService->readHistory($repoName, $branch);

        return response()->json(['history' => $history]);
    }
}
