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

class FacetSearchService
{
    private string $dataPath;

    private string $facetsPath;

    /** @var array<int, string> */
    private array $relationKeys;

    /** @var array<int, string> */
    private array $stringFacetKeys;

    /**
     * Hard-coded platformTEMP facet values (string facet).
     *
     * Exposed as the "platformTEMP" facet key in the facets document so
     * the frontend can populate dropdowns from a stable, predefined list.
     *
     * @var array<int, string>
     */
    private const PLATFORM_TEMP_VALUES = [
        'Customer facing',
        'Data & AI',
        'Dispatching',
        'Enterprise Services',
        'Finance & Controlling',
        'HR',
        'Logistics',
        'Manufacturing & Production',
        'Sales',
        'Supply chain',
        'Technology foundation',
        'Transactional core',
    ];

    public function __construct()
    {
        $this->dataPath = config('data.path');
        $this->facetsPath = $this->dataPath . DIRECTORY_SEPARATOR . '.meta' . DIRECTORY_SEPARATOR . 'facets.json';
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
        /** @var array<int, string> $stringFacetKeys */
        $stringFacetKeys = config('facets.string_facet_keys', [
            'type',
            'technicalSuitability',
            'businessCriticality',
            'functionalSuitability',
            'lxTimeClassification',
            'lxHostingType',
            'lxProductCategory',
        ]);

        $this->relationKeys = $relationKeys;
        $this->stringFacetKeys = $stringFacetKeys;
    }

    private function resolvePath(?string $dataPath): string
    {
        return $dataPath !== null && $dataPath !== '' ? $dataPath : $this->dataPath;
    }

    private function facetsPathFor(?string $dataPath): string
    {
        $path = $this->resolvePath($dataPath);
        return $path . DIRECTORY_SEPARATOR . '.meta' . DIRECTORY_SEPARATOR . 'facets.json';
    }

    /**
     * Get facets document. Uses cached file if present and _updated is within TTL;
     * otherwise rebuilds and returns fresh data.
     *
     * @return array<string, mixed>
     */
    public function getCached(?string $dataPath = null): array
    {
        $ttlDays = (float) config('facets.cache_ttl_days', 1);
        $cached = $this->readFacetsFile($dataPath);

        if ($cached !== null && $this->isWithinTtl($cached['_updated'] ?? null, $ttlDays)) {
            return $cached;
        }
        return $this->rebuild($dataPath);
    }

    /**
     * Rebuild facets from all entity JSON files in data and write to data/.meta/facets.json.
     *
     * @return array<string, mixed>
     */
    public function rebuild(?string $dataPath = null): array
    {
        $basePath = $this->resolvePath($dataPath);
        $typeSet = [];
        $technicalSuitabilitySet = [];
        $businessCriticalitySet = [];
        $functionalSuitabilitySet = [];
        $lxTimeClassificationSet = [];
        $lxHostingTypeSet = [];
        $lxProductCategorySet = [];
        $relationBuckets = [];
        foreach ($this->relationKeys as $relKey) {
            $relationBuckets[$relKey] = []; // id => factSheet summary
        }
        $tagsById = []; // id => tag object

        // Entity files are stored one level deep by type (e.g. Application/*.json).
        // Also include any JSON files directly at the base path for backwards compatibility.
        $subFiles = glob($basePath . DIRECTORY_SEPARATOR . '*' . DIRECTORY_SEPARATOR . '*.json');
        $rootFiles = glob($basePath . DIRECTORY_SEPARATOR . '*.json');
        $files = array_merge(
            is_array($subFiles) ? $subFiles : [],
            is_array($rootFiles) ? $rootFiles : [],
        );

        foreach ($files as $path) {
            $raw = @file_get_contents($path);
            if ($raw === false) {
                continue;
            }
            $decoded = json_decode($raw, true);
            if (! is_array($decoded)) {
                continue;
            }
            $this->collectStringFacets($decoded, $typeSet, $technicalSuitabilitySet, $businessCriticalitySet, $functionalSuitabilitySet, $lxTimeClassificationSet, $lxHostingTypeSet, $lxProductCategorySet);
            $this->collectRelationFacets($decoded, $relationBuckets);
            $this->collectTags($decoded, $tagsById);
        }

        $facets = [
            '_updated' => now()->toIso8601String(),
            'type' => array_values(array_unique($typeSet)),
            'technicalSuitability' => array_values(array_unique($technicalSuitabilitySet)),
            'businessCriticality' => array_values(array_unique($businessCriticalitySet)),
            'functionalSuitability' => array_values(array_unique($functionalSuitabilitySet)),
            'lxTimeClassification' => array_values(array_unique($lxTimeClassificationSet)),
            'lxHostingType' => array_values(array_unique($lxHostingTypeSet)),
            'lxProductCategory' => array_values(array_unique($lxProductCategorySet)),
        ];

        // Hard-coded string facet for platformTEMP (not derived from entities).
        $facets['platformTEMP'] = self::PLATFORM_TEMP_VALUES;

        foreach ($this->relationKeys as $relKey) {
            $facets[$relKey] = array_values($relationBuckets[$relKey]);
        }
        $facets['tags'] = array_values($tagsById);

        $this->writeFacetsFile($facets, $dataPath);

        return $facets;
    }

    /**
     * @param array<string, mixed> $decoded
     * @param array<int, string> $typeSet
     * @param array<int, string> $technicalSuitabilitySet
     * @param array<int, string> $businessCriticalitySet
     * @param array<int, string> $functionalSuitabilitySet
     * @param array<int, string> $lxTimeClassificationSet
     * @param array<int, string> $lxHostingTypeSet
     * @param array<int, string> $lxProductCategorySet
     */
    private function collectStringFacets(
        array $decoded,
        array &$typeSet,
        array &$technicalSuitabilitySet,
        array &$businessCriticalitySet,
        array &$functionalSuitabilitySet,
        array &$lxTimeClassificationSet,
        array &$lxHostingTypeSet,
        array &$lxProductCategorySet
    ): void {
        foreach ($this->stringFacetKeys as $key) {
            $v = $decoded[$key] ?? null;
            if (!is_string($v) || $v === '') {
                continue;
            }
            $s = $v;
            switch ($key) {
                case 'type':
                    $typeSet[$s] = $s;
                    break;
                case 'technicalSuitability':
                    $technicalSuitabilitySet[$s] = $s;
                    break;
                case 'businessCriticality':
                    $businessCriticalitySet[$s] = $s;
                    break;
                case 'functionalSuitability':
                    $functionalSuitabilitySet[$s] = $s;
                    break;
                case 'lxTimeClassification':
                    $lxTimeClassificationSet[$s] = $s;
                    break;
                case 'lxHostingType':
                    $lxHostingTypeSet[$s] = $s;
                    break;
                case 'lxProductCategory':
                    $lxProductCategorySet[$s] = $s;
                    break;
            }
        }
    }

    /**
     * @param array<string, mixed> $decoded
     * @param array<string, array<string, array<string, mixed>>> $relationBuckets
     */
    private function collectRelationFacets(array $decoded, array &$relationBuckets): void
    {
        foreach ($this->relationKeys as $relKey) {
            $rel = $decoded[$relKey] ?? null;
            if (! is_array($rel)) {
                continue;
            }
            $edges = $rel['edges'] ?? [];
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
                $id = $factSheet['id'] ?? null;
                if ($id === null || $id === '') {
                    continue;
                }
                $summary = [
                    'id' => $id,
                    'displayName' => $factSheet['displayName'] ?? '',
                    'fullName' => $factSheet['fullName'] ?? '',
                    'type' => $factSheet['type'] ?? '',
                    'category' => $factSheet['category'] ?? '',
                    'description' => $factSheet['description'] ?? '',
                ];
                $relationBuckets[$relKey][$id] = $summary;
            }
        }
    }

    /**
     * @param array<string, mixed> $decoded
     * @param array<string, array<string, mixed>> $tagsById
     */
    private function collectTags(array $decoded, array &$tagsById): void
    {
        $this->collectTagsFromList($decoded['tags'] ?? [], $tagsById);
        foreach ($this->relationKeys as $relKey) {
            $rel = $decoded[$relKey] ?? null;
            if (! is_array($rel)) {
                continue;
            }
            $edges = $rel['edges'] ?? [];
            if (! is_array($edges)) {
                continue;
            }
            foreach ($edges as $edge) {
                $node = is_array($edge) ? ($edge['node'] ?? null) : null;
                if (! is_array($node)) {
                    continue;
                }
                $factSheet = $node['factSheet'] ?? null;
                if (is_array($factSheet)) {
                    $this->collectTagsFromList($factSheet['tags'] ?? [], $tagsById);
                }
            }
        }
    }

    /**
     * @param array<int, mixed> $tagList
     * @param array<string, array<string, mixed>> $tagsById
     */
    private function collectTagsFromList(array $tagList, array &$tagsById): void
    {
        foreach ($tagList as $tag) {
            if (! is_array($tag)) {
                continue;
            }
            $id = $tag['id'] ?? null;
            if ($id === null || $id === '') {
                continue;
            }
            $tagGroup = $tag['tagGroup'] ?? null;
            $tagGroupId = null;
            $tagGroupName = null;
            $tagGroupShortName = null;
            $tagGroupMode = null;
            $tagGroupMandatory = null;
            if (is_array($tagGroup)) {
                $tagGroupId = $tagGroup['id'] ?? null;
                $tagGroupName = $tagGroup['name'] ?? null;
                $tagGroupShortName = $tagGroup['shortName'] ?? null;
                $tagGroupMode = $tagGroup['mode'] ?? null;
                $tagGroupMandatory = $tagGroup['mandatory'] ?? null;
            }
            $tagsById[$id] = [
                'id' => $id,
                'name' => $tag['name'] ?? '',
                'color' => $tag['color'] ?? '',
                'description' => $tag['description'] ?? '',
                'tagGroupId' => $tagGroupId,
                'tagGroupName' => $tagGroupName,
                'tagGroupShortName' => $tagGroupShortName,
                'tagGroupMode' => $tagGroupMode,
                'tagGroupMandatory' => $tagGroupMandatory,
            ];
        }
    }

    private function readFacetsFile(?string $dataPath = null): ?array
    {
        $path = $this->facetsPathFor($dataPath);
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
     * Invalidate the cached facets file for the given data path (or default path).
     */
    public function invalidate(?string $dataPath = null): void
    {
        $path = $this->facetsPathFor($dataPath);
        if (is_file($path)) {
            @unlink($path);
        }
    }

    private function isWithinTtl(?string $updated, float $ttlDays): bool
    {
        if ($updated === null || $updated === '') {
            return false;
        }
        try {
            $updatedTime = new \DateTimeImmutable($updated);
        } catch (\Throwable) {
            return false;
        }
        $cutoff = now()->subDays($ttlDays);

        return $updatedTime >= $cutoff;
    }

    /**
     * @param array<string, mixed> $facets
     */
    private function writeFacetsFile(array $facets, ?string $dataPath = null): void
    {
        $path = $this->facetsPathFor($dataPath);
        $metaDir = dirname($path);
        if (! File::isDirectory($metaDir)) {
            File::makeDirectory($metaDir, 0755, true);
        }
        $json = json_encode($facets, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        if (file_put_contents($path, $json, LOCK_EX) === false) {
            throw new \RuntimeException('Failed to write facets file.');
        }
    }
}
