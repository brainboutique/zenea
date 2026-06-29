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
    private RoleEvaluationService $roleEvaluation;

    public function __construct(GoogleAuthService $googleAuth, RoleEvaluationService $roleEvaluation)
    {
        $this->googleAuth = $googleAuth;
        $this->roleEvaluation = $roleEvaluation;
    }

    public function isAuthorizationEnabled(string $username): bool
    {
        $authData = $this->getUserAuthData($username);

        if (! empty($authData['isAdmin'])) {
            return false;
        }

        return ! empty($authData['repositories']);
    }

    public function canRead(string $username, string $repoName, string $branch): bool
    {
        if ($this->isAdmin($username)) {
            return true;
        }

        $authData = $this->getUserAuthData($username);
        $repositories = $authData['repositories'] ?? [];
        $repoBranch = "$repoName/$branch";

        return isset($repositories[$repoBranch]) && is_array($repositories[$repoBranch]) && $repositories[$repoBranch] !== [];
    }

    public function canEdit(string $username, string $repoName, string $branch): bool
    {
        if ($this->isAdmin($username)) {
            return true;
        }

        $roles = $this->getUserRoles($username, $repoName, $branch);
        if (empty($roles)) {
            return false;
        }

        return $this->roleEvaluation->hasAnyWritePermission($username, $repoName, $branch);
    }

    public function isAdmin(string $username): bool
    {
        $authData = $this->getUserAuthData($username);

        return ! empty($authData['isAdmin']);
    }

    public function getAuthorizedRepos(string $username): array
    {
        $authData = $this->getUserAuthData($username);

        if ($this->isAdminFromData($authData)) {
            return $this->discoverExistingRepos();
        }

        $repositories = $authData['repositories'] ?? [];

        return array_values(array_keys($repositories));
    }

    public function getUserRoles(string $username, string $repoName, string $branch): array
    {
        $authData = $this->getUserAuthData($username);
        $repositories = $authData['repositories'] ?? [];
        $repoBranch = "$repoName/$branch";

        return $repositories[$repoBranch] ?? [];
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

        if (! isset($data[$usernameLower]['repositories'])) {
            $data[$usernameLower]['repositories'] = [];
        }

        if (! isset($data[$usernameLower]['repositories'][$repoBranch])) {
            $defaultRole = $this->getDefaultRole();
            $data[$usernameLower]['repositories'][$repoBranch] = $defaultRole !== null ? [$defaultRole] : [];
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
            if ($entry === '.' || $entry === '..' || str_starts_with($entry, '.')) {
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

    private function getDefaultRole(): ?string
    {
        $dataPath = rtrim((string) config('data.path', base_path('../data')), \DIRECTORY_SEPARATOR);
        $path = $dataPath . \DIRECTORY_SEPARATOR . '.roles.json';

        if (! is_file($path)) {
            return null;
        }

        $json = @file_get_contents($path);
        if ($json === false) {
            return null;
        }

        $data = json_decode($json, true);
        if (! is_array($data) || empty($data)) {
            return null;
        }

        return array_key_first($data);
    }

    private function isAdminFromData(array $authData): bool
    {
        return ! empty($authData['isAdmin']);
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
