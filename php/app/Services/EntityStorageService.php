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

        $decoded = $this->normalizeMigrationTargetToEdges($decoded);
        $decoded = $this->normalizeAlternativesToEdges($decoded);

        return $decoded;
    }

    /**
     * Normalize entity's alternatives to edges notation on read (same legacy shapes as migrationTarget).
     *
     * @param  array<string, mixed>  $decoded  Entity JSON (mutated in place)
     * @return array<string, mixed>
     */
    private function normalizeAlternativesToEdges(array $decoded): array
    {
        $alt = $decoded['alternatives'] ?? null;
        if ($alt === null) {
            return $decoded;
        }
        if (is_string($alt)) {
            $decoded['alternatives'] = [
                'edges' => [
                    [
                        'node' => [
                            'factSheet' => [
                                'id' => $alt,
                                'type' => 'Application',
                                'displayName' => $alt,
                            ],
                        ],
                    ],
                ],
            ];

            return $decoded;
        }
        if (is_array($alt)) {
            if (isset($alt['edges']) && is_array($alt['edges'])) {
                return $decoded;
            }
            $id = $alt['id'] ?? null;
            $displayName = $alt['displayName'] ?? $id ?? '';
            $type = isset($alt['type']) && is_string($alt['type']) ? $alt['type'] : 'Application';
            if ($id === null || $id === '') {
                return $decoded;
            }
            $decoded['alternatives'] = [
                'edges' => [
                    [
                        'node' => [
                            'factSheet' => [
                                'id' => (string) $id,
                                'type' => $type,
                                'displayName' => (string) $displayName,
                            ],
                        ],
                    ],
                ],
            ];
        }

        return $decoded;
    }

    /**
     * Normalize entity's migrationTarget to edges notation on read.
     * If migrationTarget is a string (legacy), convert to single-value edge.
     * If it is a single object {id, type?, displayName}, convert to single-value edge.
     * If it already has edges[], leave as is.
     *
     * @param  array<string, mixed>  $decoded  Entity JSON (mutated in place)
     * @return array<string, mixed>
     */
    private function normalizeMigrationTargetToEdges(array $decoded): array
    {
        $mt = $decoded['migrationTarget'] ?? null;
        if ($mt === null) {
            return $decoded;
        }
        if (is_string($mt)) {
            $decoded['migrationTarget'] = [
                'edges' => [
                    [
                        'node' => [
                            'factSheet' => [
                                'id' => $mt,
                                'type' => 'Application',
                                'displayName' => $mt,
                            ],
                        ],
                    ],
                ],
            ];

            return $decoded;
        }
        if (is_array($mt)) {
            if (isset($mt['edges']) && is_array($mt['edges'])) {
                return $decoded;
            }
            $id = $mt['id'] ?? null;
            $displayName = $mt['displayName'] ?? $id ?? '';
            $type = isset($mt['type']) && is_string($mt['type']) ? $mt['type'] : 'Application';
            if ($id === null || $id === '') {
                return $decoded;
            }
            $decoded['migrationTarget'] = [
                'edges' => [
                    [
                        'node' => [
                            'factSheet' => [
                                'id' => (string) $id,
                                'type' => $type,
                                'displayName' => (string) $displayName,
                            ],
                        ],
                    ],
                ],
            ];
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
     * List entities from all *.json files in data directory, with optional filters (AND combined).
     *
     * @param  array{filterDisplayName?: string, filterTechnicalSuitability?: string, filterFunctionalSuitability?: string, filterRelApplicationToBusinessCapability?: string, filterRelApplicationToUserGroup?: string, filterRelApplicationToProject?: string, filterPlatformTEMP?: string}  $filters
     * @return array<int, array{id: string, displayName: string, type: string, earmarkingsTEMP?: string|null, lxTimeClassification?: string, lxTimeClassificationDescription?: string|null, functionalSuitability?: string, technicalSuitability?: string, businessCriticality?: string, aggregatedObsolescenceRisk?: string|number|null, relApplicationToUserGroup: array, relApplicationToBusinessCapability: array, platformTEMP?: string|null, migrationTarget?: array<int, array{id: string, type: string, displayName: string}>|null, ApplicationLifecycle?: array|null}>
     */
    public function listEntities(array $filters = [], ?string $dataPath = null): array
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
        $filterPlatformTEMP = isset($filters['filterPlatformTEMP']) ? trim($filters['filterPlatformTEMP']) : null;

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
            $decoded = $this->normalizeMigrationTargetToEdges($decoded);
            $decoded = $this->normalizeAlternativesToEdges($decoded);

            $displayName = isset($decoded['displayName']) && is_string($decoded['displayName']) ? $decoded['displayName'] : '';
            $technicalSuitability = $decoded['technicalSuitability'] ?? null;
            $functionalSuitabilityRaw = $decoded['functionalSuitability'] ?? $decoded['businessSuitability'] ?? null;
            $platformTEMP = $decoded['platformTEMP'] ?? null;
            $id = $decoded['id'] ?? basename($path, '.json');
            $type = $decoded['type'] ?? '';

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
            if ($filterRelApplicationToBusinessCapability !== null && $filterRelApplicationToBusinessCapability !== '') {
                if (! $this->entityHasRelationDisplayNameContains($decoded, 'relApplicationToBusinessCapability', $filterRelApplicationToBusinessCapability)) {
                    continue;
                }
            }
            if ($filterRelApplicationToUserGroup !== null && $filterRelApplicationToUserGroup !== '') {
                if (! $this->entityHasRelationDisplayNameContains($decoded, 'relApplicationToUserGroup', $filterRelApplicationToUserGroup)) {
                    continue;
                }
            }
            if ($filterRelApplicationToProject !== null && $filterRelApplicationToProject !== '') {
                if (! $this->entityHasRelationDisplayNameContains($decoded, 'relApplicationToProject', $filterRelApplicationToProject)) {
                    continue;
                }
            }
            if ($filterRelApplicationToDataProduct !== null && $filterRelApplicationToDataProduct !== '') {
                if (! $this->entityHasRelationDisplayNameContains($decoded, 'relApplicationToDataProduct', $filterRelApplicationToDataProduct)) {
                    continue;
                }
            }
            if ($filterRelApplicationToPlatform !== null && $filterRelApplicationToPlatform !== '') {
                if (! $this->entityHasRelationDisplayNameContains($decoded, 'relApplicationToPlatform', $filterRelApplicationToPlatform)) {
                    continue;
                }
            }

            if ($filterPlatformTEMP !== null && $filterPlatformTEMP !== '') {
                $pt = is_string($platformTEMP) ? trim($platformTEMP) : (string) $platformTEMP;
                if ($pt === '' || $pt !== $filterPlatformTEMP) {
                    continue;
                }
            }

            $lifecycle = $decoded['ApplicationLifecycle'] ?? null;
            $lifecycleAsString = null;
            if (is_array($lifecycle)) {
                $value = $lifecycle['asString'] ?? null;
                if (is_string($value) || is_numeric($value)) {
                    $lifecycleAsString = (string) $value;
                }
            }

            $results[] = [
                'id' => (string) $id,
                'displayName' => $displayName,
                'type' => (string) $type,
                'description' => isset($decoded['description']) && (is_string($decoded['description']) || is_numeric($decoded['description']))
                    ? (string) $decoded['description']
                    : null,
                'earmarkingsTEMP' => isset($decoded['earmarkingsTEMP']) && is_string($decoded['earmarkingsTEMP']) ? $decoded['earmarkingsTEMP'] : null,
                'lxTimeClassification' => isset($decoded['lxTimeClassification']) && (is_string($decoded['lxTimeClassification']) || is_numeric($decoded['lxTimeClassification'])) ? (string) $decoded['lxTimeClassification'] : null,
                'lxTimeClassificationDescription' => isset($decoded['lxTimeClassificationDescription']) && is_string($decoded['lxTimeClassificationDescription']) ? $decoded['lxTimeClassificationDescription'] : null,
                'functionalSuitability' => isset($decoded['functionalSuitability']) && (is_string($decoded['functionalSuitability']) || is_numeric($decoded['functionalSuitability'])) ? (string) $decoded['functionalSuitability'] : null,
                'technicalSuitability' => $technicalSuitability !== null && (is_string($technicalSuitability) || is_numeric($technicalSuitability)) ? (string) $technicalSuitability : null,
                'businessCriticality' => isset($decoded['businessCriticality']) && (is_string($decoded['businessCriticality']) || is_numeric($decoded['businessCriticality'])) ? (string) $decoded['businessCriticality'] : null,
                'aggregatedObsolescenceRisk' => $decoded['aggregatedObsolescenceRisk'] ?? null,
                'relApplicationToUserGroup' => $this->relationToFacetStyleArray($decoded, 'relApplicationToUserGroup'),
                'relApplicationToBusinessCapability' => $this->relationToFacetStyleArray($decoded, 'relApplicationToBusinessCapability'),
                'relApplicationToDataProduct' => $this->relationToFacetStyleArray($decoded, 'relApplicationToDataProduct'),
                'platformTEMP' => isset($platformTEMP) && (is_string($platformTEMP) || is_numeric($platformTEMP)) ? (string) $platformTEMP : null,
                'migrationTarget' => $this->extractMigrationTarget($decoded),
                'alternatives' => $this->extractAlternatives($decoded),
                'ApplicationLifecycle' => $lifecycleAsString !== null ? ['asString' => $lifecycleAsString] : null,
            ];
        }

        return $results;
    }

    /**
     * Check if entity has at least one edge in the given relation whose factSheet id equals the given GUID.
     *
     * @param  array<string, mixed>  $decoded
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
            if ($id === $factSheetId) {
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

    /**
     * Extract migration targets from entity JSON (edges notation).
     * Call after normalizeMigrationTargetToEdges so migrationTarget has edges[].
     *
     * @param  array<string, mixed>  $decoded  Entity JSON
     * @return array<int, array{
     *   id: string,
     *   type: string,
     *   displayName: string,
     *   lifecycle?: string,
     *   proportion?: int,
     *   priority?: int,
     *   effort?: string,
     *   eta?: string
     * }>
     */
    private function extractMigrationTarget(array $decoded): array
    {
        $mt = $decoded['migrationTarget'] ?? null;
        if (! is_array($mt)) {
            return [];
        }
        $edges = $mt['edges'] ?? [];
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
            $proportion = $edge['proportion'] ?? null;
            $priority = $edge['priority'] ?? null;
            $effort = $edge['effort'] ?? null;
            $eta = $edge['eta'] ?? null;
            $lifecycleRaw = $edge['lifecycle'] ?? null;
            $lifecycle = null;
            if (is_string($lifecycleRaw) || is_numeric($lifecycleRaw)) {
                $lifecycle = (string) $lifecycleRaw;
            } elseif (is_array($lifecycleRaw)) {
                // Support occasional nested shape like { asString: "Idea" }.
                $value = $lifecycleRaw['asString'] ?? null;
                if (is_string($value) || is_numeric($value)) {
                    $lifecycle = (string) $value;
                }
            }
            $out[] = array_filter([
                'id' => (string) $id,
                'type' => isset($factSheet['type']) && is_string($factSheet['type']) ? $factSheet['type'] : 'Application',
                'displayName' => isset($factSheet['displayName']) && is_string($factSheet['displayName']) ? $factSheet['displayName'] : (string) $id,
                'proportion' => is_numeric($proportion) ? (int) $proportion : null,
                'priority' => is_numeric($priority) ? (int) $priority : null,
                'effort' => is_string($effort) && $effort !== '' ? $effort : null,
                'eta' => is_string($eta) && $eta !== '' ? $eta : null,
                'lifecycle' => is_string($lifecycle) && $lifecycle !== '' ? $lifecycle : null,
            ], fn ($v) => $v !== null && $v !== '');
        }

        return $out;
    }

    /**
     * Extract alternatives from entity JSON (edges notation).
     * Call after normalizeAlternativesToEdges so alternatives has edges[].
     *
     * @param  array<string, mixed>  $decoded  Entity JSON
     * @return array<int, array{
     *   id: string,
     *   type: string,
     *   displayName: string,
     *   functionalOverlap?: int,
     *   comment?: string
     * }>
     */
    private function extractAlternatives(array $decoded): array
    {
        $alt = $decoded['alternatives'] ?? null;
        if (! is_array($alt)) {
            return [];
        }
        $edges = $alt['edges'] ?? [];
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
            $functionalOverlap = $edge['functionalOverlap'] ?? null;
            $comment = $edge['comment'] ?? null;
            $row = [
                'id' => (string) $id,
                'type' => isset($factSheet['type']) && is_string($factSheet['type']) ? $factSheet['type'] : 'Application',
                'displayName' => isset($factSheet['displayName']) && is_string($factSheet['displayName']) ? $factSheet['displayName'] : (string) $id,
            ];
            if (is_numeric($functionalOverlap)) {
                $fo = (int) $functionalOverlap;
                if ($fo >= 0 && $fo <= 100) {
                    $row['functionalOverlap'] = $fo;
                }
            }
            if (is_string($comment) && $comment !== '') {
                $row['comment'] = $comment;
            }
            $out[] = $row;
        }

        return $out;
    }
}
