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

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;

class EntityStorageService
{
    private string $dataPath;

    /** UUID v4 pattern (8-4-4-4-12 hex digits) - prevents path traversal */
    private const GUID_PATTERN = '#^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$#i';

    public function __construct(
        private readonly GitService $gitService,
        private readonly ApplicationsService $applicationsService,
        private readonly FacetSearchService $facetSearchService,
        private readonly EntityService $entityService,
    ) {
        $this->dataPath = config('data.path');
    }

    /**
     * Recursively normalize a JSON-like value to a canonical form.
     * - For associative arrays (objects), keys are sorted in a stable order.
     * - For list arrays, element order is preserved while values are normalized.
     *
     * @param  mixed  $value
     * @return mixed
     */
    private function normalizeJsonValue(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }

        if (array_is_list($value)) {
            foreach ($value as $k => $v) {
                $value[$k] = $this->normalizeJsonValue($v);
            }

            return $value;
        }

        $normalized = [];
        foreach ($value as $k => $v) {
            $normalized[$k] = $this->normalizeJsonValue($v);
        }

        ksort($normalized, SORT_NATURAL);

        return $normalized;
    }

    /**
     * Normalize an entity payload into canonical JSON form.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function normalizeEntityData(array $data): array
    {
        /** @var array<string, mixed> $normalized */
        $normalized = $this->normalizeJsonValue($data);

        return $normalized;
    }

    private function resolvePath(?string $dataPath): string
    {
        return $dataPath !== null && $dataPath !== '' ? $dataPath : $this->dataPath;
    }

    /**
     * Check if the given string is a valid GUID (UUID format).
     * Accepts optional surrounding whitespace and curly braces (e.g. "{uuid}").
     */
    public function isValidGuid(string $guid): bool
    {
        $normalized = $this->normalizeGuid($guid);

        return $normalized !== null && (bool) preg_match(self::GUID_PATTERN, $normalized);
    }

    /**
     * Normalize GUID: trim and remove optional surrounding curly braces.
     * Returns null if empty after trim.
     */
    public function normalizeGuid(string $guid): ?string
    {
        $s = trim($guid);
        if ($s === '') {
            return null;
        }
        if (str_starts_with($s, '{') && str_ends_with($s, '}')) {
            $s = substr($s, 1, -1);
        }
        $s = trim($s);

        return $s === '' ? null : $s;
    }

    /**
     * Ensure the data directory exists.
     */
    private function ensureDataDir(?string $dataPath = null): void
    {
        $path = $this->resolvePath($dataPath);
        if (! File::isDirectory($path)) {
            @File::makeDirectory($path, 0755, true);
        }
    }

    /**
     * Get the file path for a GUID (without creating the file).
     */
    private function filePath(string $guid, ?string $dataPath = null): string
    {
        return $this->resolvePath($dataPath) . DIRECTORY_SEPARATOR . $guid . '.json';
    }

    /**
     * Get the latest version of an entity by GUID.
     * Returns decoded JSON as array, or null if not found.
     */
    public function get(string $guid, ?string $dataPath = null): ?array
    {
        $guid = $this->normalizeGuid($guid) ?? $guid;
        if (! (bool) preg_match(self::GUID_PATTERN, $guid)) {
            return null;
        }

        $path = $this->filePath($guid, $dataPath);
        if (! is_file($path)) {
            return null;
        }

        $raw = @file_get_contents($path);
        if ($raw === false) {
            return null;
        }

        $decoded = json_decode($raw, true);
        if (! is_array($decoded)) {
            return null;
        }

        return $decoded;
    }

    /**
     * Put a new or updated version of an entity by GUID.
     * Content must be JSON-serializable (array or object).
     * If a new file is created and the folder is under git control, runs "git add" on it.
     *
     * @param  array<string, mixed>  $data
     */
    public function put(string $guid, array $data, ?string $dataPath = null): void
    {
        $guid = $this->normalizeGuid($guid) ?? $guid;
        if (! (bool) preg_match(self::GUID_PATTERN, $guid)) {
            throw new \InvalidArgumentException('Invalid GUID format.');
        }

        $this->ensureDataDir($dataPath);
        $basePath = $this->resolvePath($dataPath);
        $path = $this->filePath($guid, $dataPath);
        $wasNew = ! is_file($path);

        $before = null;
        if (! $wasNew) {
            $before = $this->get($guid, $dataPath);
        }

        $normalized = $this->normalizeEntityData($data);
        $json = json_encode($normalized, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        if (file_put_contents($path, $json, LOCK_EX) === false) {
            throw new \RuntimeException('Failed to write entity file.');
        }

        if ($wasNew) {
            $this->gitService->addPathIfUnderGit($path);
        }

        // Pass parent directory (repo/branch) for cache invalidation, not $basePath (which includes type subdir)
        $cacheBasePath = dirname($basePath);
        $this->invalidateMetaOnChange($before, $normalized, $cacheBasePath);
    }

    /**
     * Soft-delete an entity by renaming the file to .json.deleted_<timestamp>.
     * Returns true if a file was found and renamed, false if not found.
     */
    public function delete(string $guid, ?string $dataPath = null): bool
    {
        $guid = $this->normalizeGuid($guid) ?? $guid;
        if (! (bool) preg_match(self::GUID_PATTERN, $guid)) {
            return false;
        }

        $basePath = $this->resolvePath($dataPath);
        $path = $this->filePath($guid, $dataPath);
        if (! is_file($path)) {
            return false;
        }

        $before = $this->get($guid, $dataPath);

        $timestamp = date('Y-m-d\THis\Z');
        $deletedPath = $path . '.deleted_' . $timestamp;

        $renamed = rename($path, $deletedPath);

        if ($renamed) {
            $this->invalidateMetaOnChange($before, null, $basePath);
        }

        return $renamed;
    }

    /**
     * Invalidate meta JSON files (applications.json, facets.json) when relevant
     * entity data has changed between $before and $after for a given data root.
     *
     * @param  array<string, mixed>|null  $before
     * @param  array<string, mixed>|null  $after
     */
    private function invalidateMetaOnChange(?array $before, ?array $after, string $basePath): void
    {
        if ($this->applicationsDataChanged($before, $after)) {
            $this->applicationsService->invalidate($basePath);
        }

        if ($this->facetsDataChanged($before, $after)) {
            $this->facetSearchService->invalidate($basePath);
        }

        $this->invalidateEntityMetaCache($before, $after, $basePath);
    }

    /**
     * Invalidate type-specific meta caches when entities are created/updated/deleted.
     * Maps entity type to cache key used by EntityService.
     *
     * @param  array<string, mixed>|null  $before
     * @param  array<string, mixed>|null  $after
     */
    private function invalidateEntityMetaCache(?array $before, ?array $after, string $basePath): void
    {
        $typeMap = [
            'BusinessCapability' => 'BusinessCapability',
            'DataProduct' => 'DataProduct',
            'Platform' => 'Platform',
            'UserGroup' => 'UserGroup',
        ];

        $beforeType = $before['type'] ?? null;
        $afterType = $after['type'] ?? null;

        foreach ($typeMap as $cacheType) {
            if ($beforeType === $cacheType || $afterType === $cacheType) {
                try {
                    $this->entityService->invalidate($cacheType, $basePath);
                } catch (\Throwable $e) {
                    Log::warning('Failed to invalidate entity meta cache', [
                        'type' => $cacheType,
                        'path' => $basePath,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        }
    }

    /**
     * Detect changes that affect meta/applications.json.
     * We consider the subset of fields that ApplicationsService::rebuild() uses:
     * - type (must be "Application")
     * - status (must be "ACTIVE")
     * - id
     * - displayName
     * - lxTimeClassification
     *
     * @param  array<string, mixed>|null  $before
     * @param  array<string, mixed>|null  $after
     */
    private function applicationsDataChanged(?array $before, ?array $after): bool
    {
        $snapshot = static function (?array $entity): ?array {
            if ($entity === null) {
                return null;
            }
            $type = $entity['type'] ?? null;
            $status = $entity['status'] ?? null;
            if ($type !== 'Application' || $status !== 'ACTIVE') {
                return null;
            }

            $id = $entity['id'] ?? null;
            if ($id === null || $id === '') {
                return null;
            }

            $lxTime = $entity['lxTimeClassification'] ?? null;

            return [
                'id' => (string) $id,
                'displayName' => (string) ($entity['displayName'] ?? ''),
                'lxTimeClassification' => $lxTime === null || $lxTime === '' ? null : (string) $lxTime,
            ];
        };

        $beforeSnap = $snapshot($before);
        $afterSnap = $snapshot($after);

        return $beforeSnap !== $afterSnap;
    }

    /**
     * Detect changes that affect meta/facets.json.
     * Uses the configured facet-driving attributes from config/facets.php.
     *
     * @param  array<string, mixed>|null  $before
     * @param  array<string, mixed>|null  $after
     */
    private function facetsDataChanged(?array $before, ?array $after): bool
    {
        /** @var array<int, string> $stringKeys */
        $stringKeys = config('facets.string_facet_keys', [
            'type',
            'technicalSuitability',
            'businessCriticality',
            'functionalSuitability',
            'lxTimeClassification',
            'lxHostingType',
            'lxProductCategory',
        ]);
        /** @var array<int, string> $relationKeys */
        $relationKeys = config('facets.relation_keys', [
            'relApplicationToPlatform',
            'relProviderApplicationToInterface',
            'relApplicationToBusinessCapability',
            'relApplicationToUserGroup',
            'relBusinessApplicationToDeploymentApplication',
            'relApplicationToProject',
            'relApplicationToDataObject',
            'relApplicationToDataProduct',
        ]);

        foreach ($stringKeys as $key) {
            $beforeVal = $before[$key] ?? null;
            $afterVal = $after[$key] ?? null;
            if ($beforeVal !== $afterVal) {
                return true;
            }
        }

        foreach ($relationKeys as $key) {
            $beforeVal = $before[$key] ?? null;
            $afterVal = $after[$key] ?? null;

            $normalizedBefore = $this->normalizeJsonValue($beforeVal);
            $normalizedAfter = $this->normalizeJsonValue($afterVal);

            if ($normalizedBefore !== $normalizedAfter) {
                return true;
            }
        }

        return false;
    }

    /**
     * Collect all unique 1st-level attribute keys across all entity JSON files of a given type.
     * Returns a naturally-sorted array of unique key names.
     * Note: $dataPath must already point to the type directory (resolved by DataPathResolver).
     */
    public function getUniqueAttributeKeys(string $entityType, ?string $dataPath = null): array
    {
        $basePath = $this->resolvePath($dataPath);
        if (!is_dir($basePath)) {
            return [];
        }

        $files = glob($basePath . DIRECTORY_SEPARATOR . '*.json');
        if ($files === false || $files === []) {
            return [];
        }

        $keys = [];
        foreach ($files as $path) {
            $raw = @file_get_contents($path);
            if ($raw === false) {
                continue;
            }
            $decoded = json_decode($raw, true);
            if (!is_array($decoded)) {
                continue;
            }
            foreach (array_keys($decoded) as $key) {
                $keys[$key] = true;
            }
        }

        $result = array_keys($keys);
        sort($result, SORT_NATURAL);

        return $result;
    }

    /**
     * List entities from all *.json files in data directory, with optional filters (AND combined).
     * Returns FULL entity data (all fields from JSON files), not a projected subset.
     *
     * @param  array{filterDisplayName?: string, filterTechnicalSuitability?: string, filterFunctionalSuitability?: string, filterRelApplicationToBusinessCapability?: string, filterRelApplicationToUserGroup?: string, filterRelApplicationToProject?: string, filterPlatformTEMP?: string}  $filters
     * @return array<int, array<string, mixed>> Full entity objects with all fields
     */
    public function listEntities(array $filters = [], ?string $dataPath = null, ?string $entityType = null): array
    {
        $this->ensureDataDir($dataPath);

        $basePath = $this->resolvePath($dataPath);
        $filterDisplayName = isset($filters['filterDisplayName']) ? trim($filters['filterDisplayName']) : null;
        $filterTechnicalSuitability = isset($filters['filterTechnicalSuitability']) ? trim($filters['filterTechnicalSuitability']) : null;
        $filterFunctionalSuitability = isset($filters['filterFunctionalSuitability']) ? trim($filters['filterFunctionalSuitability']) : null;
        $filterRelApplicationToBusinessCapability = isset($filters['filterRelApplicationToBusinessCapability']) ? trim($filters['filterRelApplicationToBusinessCapability']) : null;
        $filterRelApplicationToUserGroup = isset($filters['filterRelApplicationToUserGroup']) ? trim($filters['filterRelApplicationToUserGroup']) : null;
        $filterRelApplicationToProject = isset($filters['filterRelApplicationToProject']) ? trim($filters['filterRelApplicationToProject']) : null;
        $filterRelApplicationToDataProduct = isset($filters['filterRelApplicationToDataProduct']) ? trim($filters['filterRelApplicationToDataProduct']) : null;
        $filterRelApplicationToPlatform = isset($filters['filterRelApplicationToPlatform']) ? trim($filters['filterRelApplicationToPlatform']) : null;
        $filterParents = isset($filters['filterParents']) ? trim($filters['filterParents']) : null;

        // Pre-compute descendant ID sets for BC and UG filters (transitive child matching)
        $bcMatchIds = null;
        $ugMatchIds = null;
        if ($filterRelApplicationToBusinessCapability !== null && $filterRelApplicationToBusinessCapability !== '') {
            $bcMatchIds = array_flip($this->collectDescendantIds($filterRelApplicationToBusinessCapability, 'BusinessCapability', $basePath));
        }
        if ($filterRelApplicationToUserGroup !== null && $filterRelApplicationToUserGroup !== '') {
            $ugMatchIds = array_flip($this->collectDescendantIds($filterRelApplicationToUserGroup, 'UserGroup', $basePath));
        }

        $expectedType = $entityType !== null ? trim($entityType) : null;

        $results = [];
        $files = glob($basePath . DIRECTORY_SEPARATOR . '*.json');

        if ($files === false) {
            return [];
        }

        foreach ($files as $path) {
            $raw = @file_get_contents($path);
            if ($raw === false) {
                continue;
            }

            $decoded = json_decode($raw, true);
            if (! is_array($decoded)) {
                continue;
            }

            $displayName = isset($decoded['displayName']) && is_string($decoded['displayName']) ? $decoded['displayName'] : '';
            $technicalSuitability = $decoded['technicalSuitability'] ?? null;
            $functionalSuitabilityRaw = $decoded['functionalSuitability'] ?? $decoded['businessSuitability'] ?? null;
            $id = $decoded['id'] ?? basename($path, '.json');
            $type = $decoded['type'] ?? '';

            if ($expectedType !== null && $type !== $expectedType) {
                continue;
            }

            if ($filterDisplayName !== null && $filterDisplayName !== '') {
                if (stripos($displayName, $filterDisplayName) === false) {
                    continue;
                }
            }
            if ($filterTechnicalSuitability !== null && $filterTechnicalSuitability !== '') {
                $ts = is_string($technicalSuitability) ? trim($technicalSuitability) : (string) $technicalSuitability;
                $tsEmpty = $ts === '' || $technicalSuitability === null;
                if ($filterTechnicalSuitability === 'empty') {
                    if (! $tsEmpty) {
                        continue;
                    }
                } elseif ($ts !== $filterTechnicalSuitability) {
                    continue;
                }
            }
            if ($filterFunctionalSuitability !== null && $filterFunctionalSuitability !== '') {
                $fs = is_string($functionalSuitabilityRaw) ? trim($functionalSuitabilityRaw) : (string) $functionalSuitabilityRaw;
                $fsEmpty = $fs === '' || $functionalSuitabilityRaw === null;
                if ($filterFunctionalSuitability === 'empty') {
                    if (! $fsEmpty) {
                        continue;
                    }
                } elseif ($fs !== $filterFunctionalSuitability) {
                    continue;
                }
            }
            if ($bcMatchIds !== null) {
                if (! $this->entityHasRelationFactSheetIdSet($decoded, 'relApplicationToBusinessCapability', $bcMatchIds)) {
                    continue;
                }
            }
            if ($ugMatchIds !== null) {
                if (! $this->entityHasRelationFactSheetIdSet($decoded, 'relApplicationToUserGroup', $ugMatchIds)) {
                    continue;
                }
            }
            if ($filterRelApplicationToProject !== null && $filterRelApplicationToProject !== '') {
                if (! $this->entityHasRelationFactSheetId($decoded, 'relApplicationToProject', $filterRelApplicationToProject)) {
                    continue;
                }
            }
            if ($filterRelApplicationToDataProduct !== null && $filterRelApplicationToDataProduct !== '') {
                if (! $this->entityHasRelationFactSheetId($decoded, 'relApplicationToDataProduct', $filterRelApplicationToDataProduct)) {
                    continue;
                }
            }
            if ($filterRelApplicationToPlatform !== null && $filterRelApplicationToPlatform !== '') {
                if (! $this->entityHasRelationFactSheetId($decoded, 'relApplicationToPlatform', $filterRelApplicationToPlatform)) {
                    continue;
                }
            }

            if ($filterParents !== null && $filterParents !== '') {
                $parents = isset($decoded['parents']) && is_array($decoded['parents']) ? $decoded['parents'] : [];
                if ($filterParents === 'null') {
                    if (! empty($parents)) {
                        continue;
                    }
                } else {
                    if (! in_array($filterParents, $parents, true)) {
                        continue;
                    }
                }
            }

            // Return ALL fields from the entity, not just a projected subset
            $item = $decoded;
            // Ensure these base fields are always present with correct values
            $item['id'] = (string) $id;
            $item['displayName'] = $displayName;
            $item['type'] = (string) $type;

            // Process relation fields to use facet-style arrays (for consistency)
            $relationFields = [
                'relApplicationToUserGroup', 'relApplicationToBusinessCapability',
                'relApplicationToDataProduct', 'relApplicationToProject',
                'relApplicationToPlatform',
                'relServiceCatalogSectionToBusinessCapability',
            ];
            foreach ($relationFields as $field) {
                if (array_key_exists($field, $item)) {
                    $item[$field] = $this->relationToFacetStyleArray($item, $field);
                }
            }

            $results[] = $item;
        }

        return $results;
    }

    /**
     * Check if entity has at least one edge in the given relation whose factSheet id equals the given GUID.
     *
     * @param  array<string, mixed>  $decoded
     */
    /**
     * Collect all descendant entity IDs for a given parent ID by walking relToParent edges.
     * Includes the entity itself plus all transitive children.
     *
     * @return array<int, string>
     */
    private function collectDescendantIds(string $parentId, string $entityType, string $basePath): array
    {
        $typeDir = $basePath . DIRECTORY_SEPARATOR . $entityType;
        if (! is_dir($typeDir)) {
            return [$parentId];
        }

        $childrenOf = []; // parentId => [childId, ...]
        $files = glob($typeDir . DIRECTORY_SEPARATOR . '*.json');
        if (! is_array($files)) {
            return [$parentId];
        }

        foreach ($files as $path) {
            $raw = @file_get_contents($path);
            if ($raw === false) {
                continue;
            }
            $decoded = json_decode($raw, true);
            if (! is_array($decoded)) {
                continue;
            }
            $id = $decoded['id'] ?? null;
            $relToParent = $decoded['relToParent'] ?? null;
            if ($id === null || ! is_array($relToParent)) {
                continue;
            }
            $edges = $relToParent['edges'] ?? [];
            if (! is_array($edges)) {
                continue;
            }
            foreach ($edges as $edge) {
                $node = is_array($edge) ? ($edge['node'] ?? null) : null;
                if (! is_array($node)) {
                    continue;
                }
                $factSheet = $node['factSheet'] ?? null;
                if (! is_array($factSheet)) {
                    continue;
                }
                $pId = $factSheet['id'] ?? null;
                if ($pId !== null && $pId !== '') {
                    $childrenOf[$pId][] = $id;
                }
            }
        }

        $result = [$parentId];
        $stack = [$parentId];
        $visited = [$parentId => true];
        while ($stack !== []) {
            $current = array_pop($stack);
            $children = $childrenOf[$current] ?? [];
            foreach ($children as $childId) {
                if (! isset($visited[$childId])) {
                    $visited[$childId] = true;
                    $result[] = $childId;
                    $stack[] = $childId;
                }
            }
        }

        return $result;
    }

    /**
     * Check if entity has at least one edge in the given relation whose factSheet ID is in the given set.
     */
    private function entityHasRelationFactSheetIdSet(array $decoded, string $relationKey, array $idSet): bool
    {
        $rel = $decoded[$relationKey] ?? null;
        if (! is_array($rel)) {
            return false;
        }
        $edges = $rel['edges'] ?? [];
        if (! is_array($edges)) {
            return false;
        }
        foreach ($edges as $edge) {
            $node = is_array($edge) ? ($edge['node'] ?? null) : null;
            if (! is_array($node)) {
                continue;
            }
            $factSheet = $node['factSheet'] ?? null;
            if (! is_array($factSheet)) {
                continue;
            }
            $id = $factSheet['id'] ?? null;
            if ($id !== null && isset($idSet[$id])) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if entity has at least one edge in the given relation whose factSheet ID matches.
     * For BC/UG, also matches descendant IDs (transitive child matching).
     */
    private function entityHasRelationFactSheetId(array $decoded, string $relationKey, string $factSheetId): bool
    {
        $rel = $decoded[$relationKey] ?? null;
        if (! is_array($rel)) {
            return false;
        }
        $edges = $rel['edges'] ?? [];
        if (! is_array($edges)) {
            return false;
        }
        foreach ($edges as $edge) {
            $node = is_array($edge) ? ($edge['node'] ?? null) : null;
            if (! is_array($node)) {
                continue;
            }
            $factSheet = $node['factSheet'] ?? null;
            if (! is_array($factSheet)) {
                continue;
            }
            $id = $factSheet['id'] ?? null;
            if ($id !== null && isset($matchSet[$id])) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if entity has at least one edge in the given relation whose factSheet displayName or fullName contains the given substring (case-insensitive).
     * Used for Business Capability, User Group and Project filters so sub-capabilities etc. are matched.
     *
     * @param  array<string, mixed>  $decoded
     */
    private function entityHasRelationDisplayNameContains(array $decoded, string $relationKey, string $substring): bool
    {
        $rel = $decoded[$relationKey] ?? null;
        if (! is_array($rel)) {
            return false;
        }
        $edges = $rel['edges'] ?? [];
        if (! is_array($edges)) {
            return false;
        }
        $needle = mb_strtolower(trim($substring), 'UTF-8');
        if ($needle === '') {
            return true;
        }
        foreach ($edges as $edge) {
            $node = is_array($edge) ? ($edge['node'] ?? null) : null;
            if (! is_array($node)) {
                continue;
            }
            $factSheet = $node['factSheet'] ?? null;
            if (! is_array($factSheet)) {
                continue;
            }
            $displayName = isset($factSheet['displayName']) && is_string($factSheet['displayName']) ? $factSheet['displayName'] : '';
            $fullName = isset($factSheet['fullName']) && is_string($factSheet['fullName']) ? $factSheet['fullName'] : '';
            $haystack = mb_strtolower($displayName . ' ' . $fullName, 'UTF-8');
            if (str_contains($haystack, $needle)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Convert a relation (edges with node.factSheet) to facet-style array of objects.
     * Same structure as in facets: id, displayName, fullName, type, category, description.
     *
     * @param  array<string, mixed>  $decoded  Entity JSON
     * @return array<int, array{id: string, displayName: string, fullName: string, type: string, category: string, description: string}>
     */
    private function relationToFacetStyleArray(array $decoded, string $relationKey): array
    {
        $rel = $decoded[$relationKey] ?? null;
        if (! is_array($rel)) {
            return [];
        }
        $edges = $rel['edges'] ?? [];
        if (! is_array($edges)) {
            return [];
        }
        $out = [];
        foreach ($edges as $edge) {
            $node = is_array($edge) ? ($edge['node'] ?? null) : null;
            if (! is_array($node)) {
                continue;
            }
            $factSheet = $node['factSheet'] ?? null;
            if (! is_array($factSheet)) {
                continue;
            }
            $id = $factSheet['id'] ?? null;
            if ($id === null || $id === '') {
                continue;
            }
            $out[] = [
                'id' => (string) $id,
                'displayName' => $factSheet['displayName'] ?? '',
                'fullName' => $factSheet['fullName'] ?? '',
                'type' => $factSheet['type'] ?? '',
                'category' => $factSheet['category'] ?? '',
                'description' => $factSheet['description'] ?? '',
            ];
        }
        return $out;
    }
}
