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

class AuthorizationService
{
    private GoogleAuthService $googleAuth;

    public function __construct(GoogleAuthService $googleAuth)
    {
        $this->googleAuth = $googleAuth;
    }

    public function isAuthorizationEnabled(string $username): bool
    {
        $authData = $this->getUserAuthData($username);
        return isset($authData['read']) || isset($authData['edit']);
    }

    public function canRead(string $username, string $repoName, string $branch): bool
    {
        if ($this->isAdmin($username)) {
            return true;
        }

        $authData = $this->getUserAuthData($username);

        $repoBranch = "$repoName/$branch";

        $readAccess = $authData['read'] ?? [];
        $editAccess = $authData['edit'] ?? [];

        if (empty($readAccess) && empty($editAccess)) {
            return false;
        }

        return in_array($repoBranch, $readAccess) || in_array($repoBranch, $editAccess);
    }

    public function canEdit(string $username, string $repoName, string $branch): bool
    {
        if ($this->isAdmin($username)) {
            return true;
        }

        $authData = $this->getUserAuthData($username);

        $repoBranch = "$repoName/$branch";

        $editAccess = $authData['edit'] ?? [];

        if (empty($editAccess)) {
            return false;
        }

        return in_array($repoBranch, $editAccess);
    }

    public function isAdmin(string $username): bool
    {
        $authData = $this->getUserAuthData($username);

        return ($authData['role'] ?? '') === 'admin';
    }

    public function getAuthorizedRepos(string $username): array
    {
        $authData = $this->getUserAuthData($username);

        $readAccess = $authData['read'] ?? [];
        $editAccess = $authData['edit'] ?? [];

        if (empty($readAccess) && empty($editAccess)) {
            return [];
        }

        return array_values(array_unique(array_merge($readAccess, $editAccess)));
    }

    public function addRepoToEdit(string $username, string $repoName, string $branch): bool
    {
        $authFilePath = $this->googleAuth->getAuthFilePath();
        $data = $this->loadAuthData($authFilePath);

        $usernameLower = strtolower($username);
        if (! isset($data[$usernameLower])) {
            return false;
        }

        $repoBranch = "$repoName/$branch";

        if (! isset($data[$usernameLower]['edit'])) {
            $data[$usernameLower]['edit'] = [];
        }

        if (! in_array($repoBranch, $data[$usernameLower]['edit'])) {
            $data[$usernameLower]['edit'][] = $repoBranch;
            $this->saveAuthData($authFilePath, $data);
        }

        return true;
    }

    public function discoverExistingRepos(): array
    {
        $dataPath = rtrim((string) config('data.path', base_path('../data')), \DIRECTORY_SEPARATOR);

        if (! is_dir($dataPath)) {
            return [];
        }

        $repos = [];
        $entries = scandir($dataPath);

        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..' || $entry === '.auth.json' || $entry === '.htpasswd') {
                continue;
            }

            $repoPath = $dataPath . \DIRECTORY_SEPARATOR . $entry;
            if (! is_dir($repoPath)) {
                continue;
            }

            $branches = scandir($repoPath);
            foreach ($branches as $branch) {
                if ($branch === '.' || $branch === '..') {
                    continue;
                }
                $branchPath = $repoPath . \DIRECTORY_SEPARATOR . $branch;
                if (is_dir($branchPath)) {
                    $repos[] = "$entry/$branch";
                }
            }
        }

        return $repos;
    }

    private function getUserAuthData(string $username): array
    {
        $authFilePath = $this->googleAuth->getAuthFilePath();

        if (! is_file($authFilePath)) {
            return [];
        }

        $json = @file_get_contents($authFilePath);
        if ($json === false) {
            return [];
        }

        $data = json_decode($json, true);
        if (! is_array($data)) {
            return [];
        }

        $usernameLower = strtolower($username);
        if (! isset($data[$usernameLower]) || ! is_array($data[$usernameLower])) {
            return [];
        }

        return $data[$usernameLower];
    }

    private function loadAuthData(string $path): array
    {
        if (! is_file($path)) {
            return [];
        }

        $json = @file_get_contents($path);
        if ($json === false) {
            return [];
        }

        $data = json_decode($json, true);

        return is_array($data) ? $data : [];
    }

    private function saveAuthData(string $path, array $data): bool
    {
        return file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) !== false;
    }
}
