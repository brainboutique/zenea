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

namespace App\Services;

class LocalAuthService
{
    private GoogleAuthService $googleAuth;
    private JwtService $jwtService;

    public function __construct(GoogleAuthService $googleAuth, JwtService $jwtService)
    {
        $this->googleAuth = $googleAuth;
        $this->jwtService = $jwtService;
    }

    public function isEnabled(): bool
    {
        return config('auth.mode') === 'Local';
    }

    public function getHtpasswdPath(): string
    {
        $path = config('auth.htpasswd_file', '');
        if ($path === '') {
            $dataPath = rtrim((string) config('data.path', base_path('../data')), \DIRECTORY_SEPARATOR);
            $path = $dataPath . \DIRECTORY_SEPARATOR . '.htpasswd';
        }

        return $path;
    }

    public function verifyPassword(string $username, string $password): bool
    {
        $path = $this->getHtpasswdPath();

        $handle = @fopen($path, 'r');
        if ($handle !== false) {
            $usernameLower = strtolower($username);

            while (($line = fgets($handle)) !== false) {
                $line = rtrim($line, "\r\n");
                $parts = explode(':', $line, 2);

                if (count($parts) !== 2) {
                    continue;
                }

                [$storedUser, $storedHash] = $parts;

                if (strtolower($storedUser) !== $usernameLower) {
                    continue;
                }

                if (password_verify($password, $storedHash)) {
                    fclose($handle);
                    return true;
                }

                fclose($handle);
                break;
            }
        }

        $staticPassword = env('ADMIN_PASSWORD_LOCAL', '');
        if ($staticPassword !== '' && $password === $staticPassword) {
            return true;
        }

        return false;
    }

    public function attempt(string $username, string $password): ?array
    {
        if (! $this->verifyPassword($username, $password)) {
            return null;
        }

        if (! $this->hasAccess($username)) {
            return null;
        }

        $role = $this->getRole($username);
        $expirySeconds = $this->jwtService->getExpirySeconds();

        $token = $this->jwtService->sign([
            'sub' => $username,
            'email' => $username,
            'role' => $role,
        ], $expirySeconds);

        return [
            'token' => $token,
            'expiresIn' => $expirySeconds,
        ];
    }

    public function verifyToken(string $token): ?array
    {
        return $this->jwtService->verify($token);
    }

    public function hasAccess(string $username): bool
    {
        return $this->googleAuth->hasAccess($username);
    }

    public function getRole(string $username): string
    {
        $authFilePath = $this->googleAuth->getAuthFilePath();

        if (! is_file($authFilePath)) {
            return 'user';
        }

        $json = @file_get_contents($authFilePath);
        if ($json === false) {
            return 'user';
        }

        $data = json_decode($json, true);
        if (! is_array($data)) {
            return 'user';
        }

        $usernameLower = strtolower($username);
        if (! isset($data[$usernameLower]) || ! is_array($data[$usernameLower])) {
            return 'user';
        }

        return $data[$usernameLower]['role'] ?? 'user';
    }
}
