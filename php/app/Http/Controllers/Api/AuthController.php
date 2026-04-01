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
use App\Services\GoogleAuthService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class AuthController extends Controller
{
    public function __construct(
        private GoogleAuthService $googleAuth
    ) {
    }

    /**
     * Redirect to Google OAuth. state = redirect_uri (frontend URL to return to).
     */
    public function login(Request $request): RedirectResponse|\Illuminate\Http\JsonResponse
    {
        if (! $this->googleAuth->isEnabled()) {
            return response()->json(['message' => 'Google OAuth is not configured'], 503);
        }

        $redirectUri = $request->query('redirect_uri');
        if (! is_string($redirectUri) || $redirectUri === '') {
            return response()->json(['message' => 'redirect_uri is required'], 400);
        }

        $callbackUrl = rtrim($this->getPublicBaseUrl($request), '/') . '/api/v1/auth/callback';
        $params = http_build_query([
            'client_id' => config('google.client_id'),
            'redirect_uri' => $callbackUrl,
            'response_type' => 'code',
            'scope' => 'openid email',
            'state' => $redirectUri,
        ]);

        return redirect('https://accounts.google.com/o/oauth2/v2/auth?' . $params);
    }

    /**
     * OAuth callback: exchange code for id_token, check .auth.json, redirect to state with token in fragment.
     */
    public function callback(Request $request): RedirectResponse|\Illuminate\Http\JsonResponse
    {
        if (! $this->googleAuth->isEnabled()) {
            return response()->json(['message' => 'Google OAuth is not configured'], 503);
        }

        $code = $request->query('code');
        $state = $request->query('state');
        if (! is_string($code) || $code === '' || ! is_string($state) || $state === '') {
            return response()->json(['message' => 'code and state are required'], 400);
        }

        $callbackUrl = rtrim($this->getPublicBaseUrl($request), '/') . '/api/v1/auth/callback';
        $tokens = $this->googleAuth->exchangeCodeForTokens($code, $callbackUrl);
        if ($tokens === null) {
            Log::warning('Google OAuth: token exchange failed');
            return $this->redirectWithError($state, 'authentication failed');
        }

        $payload = $this->googleAuth->verifyIdToken($tokens['id_token']);
        if ($payload === null) {
            return $this->redirectWithError($state, 'invalid token');
        }

        $email = $payload['email'] ?? '';
        Log::warning("Login for ".$email);
        if (! $this->googleAuth->hasAccess($email)) {
            Log::warning("Access denied for ".$email);
            return $this->redirectWithError($state, 'access denied');
        }

        // Use fragment so token is not sent to the app origin server
        $target = $state . '#access_token=' . urlencode($tokens['id_token']);

        return redirect($target);
    }

    private function getPublicBaseUrl(Request $request): string
    {
        $configured = config('google.redirect_base_url', '');
        if ($configured !== '') {
            return $configured;
        }

        return $request->getSchemeAndHttpHost();
    }

    private function redirectWithError(string $state, string $error): RedirectResponse
    {
        $separator = str_contains($state, '#') ? '&' : '#';
        $target = $state . $separator . 'auth_error=' . urlencode($error);
        return redirect($target);
    }
}
