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
use App\Services\AuthorizationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuthorizationController extends Controller
{
    public function __construct(
        private AuthorizationService $authorizationService
    ) {
    }

    public function getAuthorization(Request $request): JsonResponse
    {
        $authMode = config('auth.mode');

        if ($authMode === '') {
            $repoName = $request->query('repoName', 'local');
            $branch = $request->query('branch', 'default');

            if (! is_string($repoName) || ! is_string($branch)) {
                return response()->json(['message' => 'Invalid parameters'], 400);
            }

            return response()->json([
                'repo' => "$repoName/$branch",
                'canRead' => true,
                'canEdit' => true,
                'isAdmin' => true,
                'allRepos' => [],
                'authMode' => '',
            ]);
        }

        $username = $request->attributes->get('auth_email');
        $usernameLower = $username !== null ? strtolower($username) : null;

        if ($usernameLower === null) {
            return response()->json(['message' => 'Authentication required'], 401);
        }

        $repoName = $request->query('repoName', 'local');
        $branch = $request->query('branch', 'default');

        if (! is_string($repoName) || ! is_string($branch)) {
            return response()->json(['message' => 'Invalid parameters'], 400);
        }

        return response()->json([
            'repo' => "$repoName/$branch",
            'canRead' => $this->authorizationService->canRead($usernameLower, $repoName, $branch),
            'canEdit' => $this->authorizationService->canEdit($usernameLower, $repoName, $branch),
            'isAdmin' => $this->authorizationService->isAdmin($usernameLower),
            'allRepos' => $this->authorizationService->getAuthorizedRepos($usernameLower),
            'authMode' => $authMode,
        ]);
    }
}
