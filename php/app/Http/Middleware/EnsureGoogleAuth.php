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

use App\Services\GoogleAuthService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * When Google OAuth is configured, require a valid Bearer (Google ID) token and
 * that the user has access in /data/.auth.json. When not configured, pass through.
 */
class EnsureGoogleAuth
{
    public function __construct(
        private GoogleAuthService $googleAuth
    ) {
    }

    public function handle(Request $request, Closure $next): Response
    {
        if (! $this->googleAuth->isEnabled()) {
            return $next($request);
        }

        $authHeader = $request->header('Authorization');
        if (! is_string($authHeader) || ! str_starts_with(strtolower($authHeader), 'bearer ')) {
            return response()->json(['message' => 'Authentication required'], 401);
        }

        $token = trim(substr($authHeader, 7));
        if ($token === '') {
            return response()->json(['message' => 'Authentication required'], 401);
        }

        $payload = $this->googleAuth->verifyIdToken($token);
        if ($payload === null) {
            return response()->json(['message' => 'Authentication required'], 401);
        }

        $email = $payload['email'] ?? '';
        if (! $this->googleAuth->hasAccess($email)) {
            return response()->json(['message' => 'Access denied'], 403);
        }

        $request->attributes->set('google_auth_email', $email);
        $request->attributes->set('google_auth_payload', $payload);

        return $next($request);
    }
}
