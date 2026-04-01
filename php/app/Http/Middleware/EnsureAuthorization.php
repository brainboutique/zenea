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

namespace App\Http\Middleware;

use App\Services\AuthorizationService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAuthorization
{
    public function __construct(
        private AuthorizationService $authorizationService
    ) {
    }

    public function handle(Request $request, Closure $next, string $level = 'read'): Response
    {
        $authMode = config('auth.mode');

        if ($authMode === '') {
            $request->attributes->set('auth_email', 'single-user');
            $request->attributes->set('auth_mode', 'none');
            $request->attributes->set('auth_role', 'admin');
            $request->attributes->set('can_read', true);
            $request->attributes->set('can_edit', true);
            $request->attributes->set('is_admin', true);

            return $next($request);
        }

        $username = $request->attributes->get('auth_email');

        if ($username === null) {
            return response()->json(['message' => 'Authentication required'], 401);
        }

        $repoName = $request->route('repoName');
        $branch = $request->route('branch');

        // For admin-level checks (or routes without repo/branch), check role-based access
        if ($level === 'admin' || ! is_string($repoName) || ! is_string($branch)) {
            if (! $this->authorizationService->isAdmin($username)) {
                return response()->json(['message' => 'Admin access required'], 403);
            }
            // For routes without repo/branch, return early after admin check
            if (! is_string($repoName) || ! is_string($branch)) {
                return $next($request);
            }
        }

        if ($level === 'read') {
            if (! $this->authorizationService->canRead($username, $repoName, $branch)) {
                return response()->json(['message' => 'Access denied to this repository'], 403);
            }
        } elseif ($level === 'edit') {
            if (! $this->authorizationService->canEdit($username, $repoName, $branch)) {
                return response()->json(['message' => 'Write access denied to this repository'], 403);
            }
        }

        $request->attributes->set('can_read', $this->authorizationService->canRead($username, $repoName, $branch));
        $request->attributes->set('can_edit', $this->authorizationService->canEdit($username, $repoName, $branch));
        $request->attributes->set('is_admin', $this->authorizationService->isAdmin($username));

        return $next($request);
    }
}
