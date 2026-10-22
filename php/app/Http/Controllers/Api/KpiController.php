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
use DateTimeImmutable;
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
     *     description="Returns all daily KPI snapshots from /data/{repoName}/{branch}/_History. If captureNow query param is set, first re-computes KPIs for the current data state. If captureNow carries a YYYY-MM-DD date, the snapshot's _lastFileMtime is forcefully overridden with midnight of that date, which determines both the history file name and the _lastFileMtime stored in the JSON.",
     *     @OA\Parameter(name="repoName", in="path", required=true, description="Repository name", @OA\Schema(type="string")),
     *     @OA\Parameter(name="branch", in="path", required=true, description="Branch name", @OA\Schema(type="string")),
     *     @OA\Parameter(name="captureNow", in="query", required=false, description="If set without a value, force KPI capture for the current data state. If set to a YYYY-MM-DD date (e.g. 2026-07-13), force KPI capture and override _lastFileMtime with midnight of that date, determining the history file name.", @OA\Schema(type="string")),
     *     @OA\Response(response="200", description="KPI history", @OA\JsonContent()),
     *     @OA\Response(response="400", description="Invalid captureNow date", @OA\JsonContent()),
     * )
     */
    public function getHistory(Request $request, string $repoName, string $branch): JsonResponse
    {
        if ($request->has('captureNow')) {
            $overrideMtime = null;
            $rawCaptureNow = $request->query('captureNow');
            if ($rawCaptureNow !== null && $rawCaptureNow !== '') {
                if (is_string($rawCaptureNow)) {
                    $overrideMtime = $this->parseCaptureDate(trim($rawCaptureNow));
                }
                if ($overrideMtime === null) {
                    return response()->json([
                        'message' => 'captureNow must be a date in YYYY-MM-DD format.',
                    ], 400);
                }
            }

            $this->kpiService->capture($repoName, $branch, $overrideMtime);
            $this->kpiScheduler->clearDirty($repoName, $branch);
        } elseif ($this->kpiScheduler->shouldCapture($repoName, $branch)) {
            $this->kpiService->capture($repoName, $branch);
            $this->kpiScheduler->clearDirty($repoName, $branch);
        }

        $history = $this->kpiService->readHistory($repoName, $branch);

        return response()->json(['history' => $history]);
    }

    /**
     * Parse a YYYY-MM-DD captureNow value into a midnight unix timestamp.
     * Returns null if the value is not a valid calendar date.
     */
    private function parseCaptureDate(string $value): ?int
    {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        if ($date === false || $date->format('Y-m-d') !== $value) {
            return null;
        }

        return $date->getTimestamp();
    }
}
