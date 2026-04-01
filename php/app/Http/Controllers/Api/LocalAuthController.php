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
use App\Services\LocalAuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class LocalAuthController extends Controller
{
    public function __construct(
        private LocalAuthService $localAuth
    ) {
    }

    public function login(Request $request): JsonResponse
    {
        if (! $this->localAuth->isEnabled()) {
            return response()->json(['message' => 'Local authentication is not configured'], 503);
        }

        $username = $request->input('username');
        $password = $request->input('password');

        if (! is_string($username) || $username === '') {
            return response()->json(['message' => 'username is required'], 400);
        }

        if (! is_string($password) || $password === '') {
            return response()->json(['message' => 'password is required'], 400);
        }

        $result = $this->localAuth->attempt($username, $password);

        if ($result === null) {
            Log::warning("Local auth failed for user: $username");
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        Log::info("Local auth successful for user: $username");

        $role = $this->localAuth->getRole($username);

        return response()->json([
            'token' => $result['token'],
            'expiresIn' => $result['expiresIn'],
            'isAdmin' => $role === 'admin',
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        return response()->json(['success' => true]);
    }
}
