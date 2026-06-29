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

class RoleEvaluationService
{
    private const PERMISSION_NONE = 'none';
    private const PERMISSION_READ = 'read';
    private const PERMISSION_WRITE = 'write';

    private const PERMISSION_RANK = [
        self::PERMISSION_NONE => 0,
        self::PERMISSION_READ => 1,
        self::PERMISSION_WRITE => 2,
    ];

    private ?array $rolesCache = null;

    public function __construct(
        private GoogleAuthService $googleAuth,
    ) {
    }

    private const ALWAYS_READABLE = ['id', 'type', 'displayName', 'description'];

    /**
     * Get the set of attribute names that the user can read for the given entity type
     * in the specified repo/branch. Returns null if the user can read everything (admin).
     */
    public function getReadAttributes(string $username, string $repoName, string $branch, string $entityType): ?array
    {
        $roles = $this->resolveRoles($username, $repoName, $branch);
        if ($roles === null) {
            return null;
        }

        if (empty($roles)) {
            return [];
        }

        $allAttributes = $this->getAllAttributes($repoName, $branch);

        $allowed = self::ALWAYS_READABLE;
        foreach ($allAttributes as $attr) {
            if (in_array($attr, self::ALWAYS_READABLE, true)) {
                continue;
            }
            $permission = $this->evaluateAttribute($roles, $entityType, $attr);
            if (self::PERMISSION_RANK[$permission] >= self::PERMISSION_RANK[self::PERMISSION_READ]) {
                $allowed[] = $attr;
            }
        }

        return $allowed;
    }

    /**
     * Check whether the given attributes are all writable by the user.
     * Returns an array of denied attribute names, or an empty array if all are allowed.
     * Returns null if the user has full write access (admin).
     */
    public function checkWriteAttributes(string $username, string $repoName, string $branch, string $entityType, array $attributes): ?array
    {
        $roles = $this->resolveRoles($username, $repoName, $branch);
        if ($roles === null) {
            return null;
        }

        if (empty($roles)) {
            return $attributes;
        }

        $denied = [];
        foreach ($attributes as $attr) {
            $permission = $this->evaluateAttribute($roles, $entityType, $attr);
            if (self::PERMISSION_RANK[$permission] < self::PERMISSION_RANK[self::PERMISSION_WRITE]) {
                $denied[] = $attr;
            }
        }

        return $denied;
    }

    /**
     * Get the set of attribute names that the user can write for the given entity type
     * in the specified repo/branch. Returns null if the user can write everything (admin).
     */
    public function getWritableAttributes(string $username, string $repoName, string $branch, string $entityType): ?array
    {
        $roles = $this->resolveRoles($username, $repoName, $branch);
        if ($roles === null) {
            return null;
        }

        if (empty($roles)) {
            return [];
        }

        $allAttributes = $this->getAllAttributes($repoName, $branch);

        $allowed = [];
        foreach ($allAttributes as $attr) {
            $permission = $this->evaluateAttribute($roles, $entityType, $attr);
            if (self::PERMISSION_RANK[$permission] >= self::PERMISSION_RANK[self::PERMISSION_WRITE]) {
                $allowed[] = $attr;
            }
        }

        return $allowed;
    }

    /**
     * Check if the user has at least one write permission across all entity types
     * for the given repo/branch.
     */
    public function hasAnyWritePermission(string $username, string $repoName, string $branch): bool
    {
        $roles = $this->resolveRoles($username, $repoName, $branch);
        if ($roles === null) {
            return true;
        }

        if (empty($roles)) {
            return false;
        }

        $allAttributes = $this->getAllAttributes($repoName, $branch);
        $entityTypes = $this->getEntityTypes($repoName, $branch);

        foreach ($entityTypes as $entityType) {
            foreach ($allAttributes as $attr) {
                $permission = $this->evaluateAttribute($roles, $entityType, $attr);
                if (self::PERMISSION_RANK[$permission] >= self::PERMISSION_RANK[self::PERMISSION_WRITE]) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Filter an entity array, keeping only attributes the user can read.
     * Preserves 'id', 'type', and 'displayName' always.
     */
    public function filterEntityForRead(array $entity, ?array $readableAttributes): array
    {
        if ($readableAttributes === null) {
            return $entity;
        }

        $alwaysKeep = ['id', 'type', 'displayName'];
        $filtered = [];
        foreach ($entity as $key => $value) {
            if (in_array($key, $alwaysKeep, true) || in_array($key, $readableAttributes, true)) {
                $filtered[$key] = $value;
            }
        }

        return $filtered;
    }

    /**
     * Resolve which roles apply for a user on a specific repo/branch.
     * Returns null if the user is admin (bypass), or an array of role names (may be empty).
     */
    private function resolveRoles(string $username, string $repoName, string $branch): ?array
    {
        $authData = $this->getUserAuthData($username);

        if (! empty($authData['isAdmin'])) {
            return null;
        }

        $repositories = $authData['repositories'] ?? [];
        $repoBranch = "$repoName/$branch";

        return $repositories[$repoBranch] ?? [];
    }

    /**
     * Evaluate the permission for a single attribute across all applicable roles.
     * First match within each role wins; across roles, highest privilege wins.
     */
    private function evaluateAttribute(array $roles, string $entityType, string $attribute): string
    {
        $rolesData = $this->loadRoles();
        $bestPermission = self::PERMISSION_NONE;

        foreach ($roles as $roleName) {
            if (! isset($rolesData[$roleName])) {
                continue;
            }

            $rules = $rolesData[$roleName]['rules'] ?? [];
            $permission = $this->evaluateRules($rules, $entityType, $attribute);

            if (self::PERMISSION_RANK[$permission] > self::PERMISSION_RANK[$bestPermission]) {
                $bestPermission = $permission;
            }
        }

        return $bestPermission;
    }

    /**
     * Evaluate rules in order (first match wins) for a single role.
     */
    private function evaluateRules(array $rules, string $entityType, string $attribute): string
    {
        foreach ($rules as $rule) {
            $entityPattern = $rule['entity'] ?? null;
            $attributePattern = $rule['attribute'] ?? null;
            $permission = $rule['permission'] ?? self::PERMISSION_NONE;

            if ($entityPattern !== null) {
                if (! $this->matchesEntity($entityPattern, $entityType)) {
                    continue;
                }
            }

            if ($attributePattern !== null) {
                if (! $this->matchesAttribute($attributePattern, $attribute)) {
                    continue;
                }
            }

            return $permission;
        }

        return self::PERMISSION_NONE;
    }

    private function matchesEntity(string $pattern, string $entityType): bool
    {
        return (bool) preg_match('/^' . $pattern . '$/', $entityType);
    }

    private function matchesAttribute(string $pattern, string $attribute): bool
    {
        return (bool) preg_match('/^' . $pattern . '$/', $attribute);
    }

    private function loadRoles(): array
    {
        if ($this->rolesCache !== null) {
            return $this->rolesCache;
        }

        $dataPath = rtrim((string) config('data.path', base_path('../data')), \DIRECTORY_SEPARATOR);
        $path = $dataPath . \DIRECTORY_SEPARATOR . '.roles.json';

        if (! is_file($path)) {
            $this->rolesCache = [];
            return [];
        }

        $json = @file_get_contents($path);
        if ($json === false) {
            $this->rolesCache = [];
            return [];
        }

        $data = json_decode($json, true);
        $this->rolesCache = is_array($data) ? $data : [];

        return $this->rolesCache;
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

    private function getAllAttributes(string $repoName, string $branch): array
    {
        $dataPath = rtrim((string) config('data.path', base_path('../data')), \DIRECTORY_SEPARATOR);
        $branchPath = $dataPath . \DIRECTORY_SEPARATOR . $repoName . \DIRECTORY_SEPARATOR . $branch;
        $metaDir = $branchPath . \DIRECTORY_SEPARATOR . '.meta';
        $metaPath = $metaDir . \DIRECTORY_SEPARATOR . 'allAttributes.json';

        $modelMtime = $this->getModelMtime($branchPath);

        if (is_file($metaPath)) {
            $json = @file_get_contents($metaPath);
            if ($json !== false) {
                $cached = json_decode($json, true);
                if (is_array($cached) && isset($cached['attrs']) && is_array($cached['attrs']) && ($cached['modelMtime'] ?? 0) === $modelMtime) {
                    return $cached['attrs'];
                }
            }
        }

        $attrs = $this->discoverAttributesFromEntities($branchPath);

        if (! is_dir($metaDir)) {
            @mkdir($metaDir, 0755, true);
        }
        @file_put_contents($metaPath, json_encode(['modelMtime' => $modelMtime, 'attrs' => $attrs], JSON_UNESCAPED_SLASHES));

        return $attrs;
    }

    private function getModelMtime(string $branchPath): int
    {
        $mtime = 0;
        if (! is_dir($branchPath)) {
            return 0;
        }
        $types = @scandir($branchPath) ?: [];
        foreach ($types as $type) {
            if ($type === '.' || $type === '..' || str_starts_with($type, '.') || ! is_dir($branchPath . \DIRECTORY_SEPARATOR . $type)) {
                continue;
            }
            $modelPath = $branchPath . \DIRECTORY_SEPARATOR . $type . \DIRECTORY_SEPARATOR . 'model.json';
            if (is_file($modelPath)) {
                $m = @filemtime($modelPath);
                if ($m !== false && $m > $mtime) {
                    $mtime = $m;
                }
            }
        }
        return $mtime;
    }

    public function invalidateAttributeCache(): void
    {
        $dataPath = rtrim((string) config('data.path', base_path('../data')), \DIRECTORY_SEPARATOR);
        $repos = @scandir($dataPath) ?: [];
        foreach ($repos as $repo) {
            if ($repo === '.' || $repo === '..' || str_starts_with($repo, '.')) {
                continue;
            }
            $repoPath = $dataPath . \DIRECTORY_SEPARATOR . $repo;
            if (! is_dir($repoPath)) {
                continue;
            }
            $branches = @scandir($repoPath) ?: [];
            foreach ($branches as $branch) {
                if ($branch === '.' || $branch === '..') {
                    continue;
                }
                $metaPath = $repoPath . \DIRECTORY_SEPARATOR . $branch . \DIRECTORY_SEPARATOR . '.meta' . \DIRECTORY_SEPARATOR . 'allAttributes.json';
                if (is_file($metaPath)) {
                    @unlink($metaPath);
                }
            }
        }
    }

    private function getEntityTypes(string $repoName, string $branch): array
    {
        $dataPath = rtrim((string) config('data.path', base_path('../data')), \DIRECTORY_SEPARATOR);
        $branchPath = $dataPath . \DIRECTORY_SEPARATOR . $repoName . \DIRECTORY_SEPARATOR . $branch;
        $types = [];

        if (! is_dir($branchPath)) {
            return [];
        }

        $dirs = @scandir($branchPath) ?: [];
        foreach ($dirs as $dir) {
            if ($dir === '.' || $dir === '..' || str_starts_with($dir, '.') || ! is_dir($branchPath . \DIRECTORY_SEPARATOR . $dir)) {
                continue;
            }
            $types[] = $dir;
        }

        return $types;
    }

    private function discoverAttributesFromEntities(string $branchPath): array
    {
        $attributes = [];

        if (! is_dir($branchPath)) {
            return [];
        }

        $types = @scandir($branchPath) ?: [];
        foreach ($types as $type) {
            if ($type === '.' || $type === '..' || ! is_dir($branchPath . \DIRECTORY_SEPARATOR . $type)) {
                continue;
            }

            $typePath = $branchPath . \DIRECTORY_SEPARATOR . $type;

            $modelPath = $typePath . \DIRECTORY_SEPARATOR . 'model.json';
            if (is_file($modelPath)) {
                $model = @json_decode(@file_get_contents($modelPath), true);
                if (is_array($model) && isset($model['customFields']) && is_array($model['customFields'])) {
                    foreach (array_keys($model['customFields']) as $key) {
                        $attributes[$key] = true;
                    }
                }
            }

            $files = glob($typePath . \DIRECTORY_SEPARATOR . '*.json');
            if (empty($files)) {
                continue;
            }

            $sample = json_decode(file_get_contents($files[0]), true);
            if (is_array($sample)) {
                foreach (array_keys($sample) as $key) {
                    $attributes[$key] = true;
                }
            }
        }

        return array_keys($attributes);
    }
}
