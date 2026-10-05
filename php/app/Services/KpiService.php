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

class KpiService
{
    private string $dataPath;

    /** @var array<int, string> */
    private array $stringFacetKeys;

    /** @var array<int, string> */
    private array $relationKeys;

    public function __construct(
        private readonly DataPathResolver $dataPathResolver,
    ) {
        $this->dataPath = config('data.path');

        /** @var array<int, string> */
        $this->stringFacetKeys = config('facets.string_facet_keys', [
            'technicalSuitability',
            'businessCriticality',
            'functionalSuitability',
            'lxTimeClassification',
            'lxHostingType',
            'lxProductCategory',
        ]);

        /** @var array<int, string> */
        $this->relationKeys = config('facets.relation_keys', [
            'relApplicationToPlatform',
            'relProviderApplicationToInterface',
            'relApplicationToBusinessCapability',
            'relApplicationToUserGroup',
            'relBusinessApplicationToDeploymentApplication',
            'relApplicationToProject',
            'relApplicationToDataObject',
            'relApplicationToDataProduct',
        ]);
    }

    /**
     * Capture KPIs only if the data has changed since the last capture.
     * Compares max filemtime with _lastFileMtime in the existing snapshot.
     */
    public function captureIfStale(string $repoName, string $branch): void
    {
        try {
            $basePath = $this->dataPathResolver->resolve($repoName, $branch, null);
            $historyDir = $basePath . DIRECTORY_SEPARATOR . '_History';

            $maxMtime = $this->getLatestMaxMtime($basePath);
            if ($maxMtime === 0) {
                return;
            }

            $date = date('Y-m-d', $maxMtime);
            $historyFile = $historyDir . DIRECTORY_SEPARATOR . $date . '.json';

            $stale = true;
            if (is_file($historyFile)) {
                $raw = @file_get_contents($historyFile);
                if ($raw !== false) {
                    $existing = json_decode($raw, true);
                    $existingMtime = $existing['_lastFileMtime'] ?? null;
                    $stale = $existingMtime !== $maxMtime;
                    Log::info('KPI captureIfStale: existing snapshot found', [
                        'historyFile' => $historyFile,
                        'existingMtime' => $existingMtime,
                        'currentMaxMtime' => $maxMtime,
                        'stale' => $stale,
                    ]);
                }
            } else {
                Log::info('KPI captureIfStale: no existing snapshot', [
                    'historyFile' => $historyFile,
                    'stale' => true,
                ]);
            }

            if (! $stale) {
                return;
            }

            $this->capture($repoName, $branch);
        } catch (\Throwable $e) {
            Log::warning('KPI capture failed', [
                'repo' => $repoName,
                'branch' => $branch,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Capture KPIs for the current state of entity data.
     * Computes date from max filemtime of payload files.
     */
    public function capture(string $repoName, string $branch): void
    {
        $basePath = $this->dataPathResolver->resolve($repoName, $branch, null);

        $maxMtime = $this->getLatestMaxMtime($basePath);
        if ($maxMtime === 0) {
            Log::info('KPI capture: no payload files found', ['basePath' => $basePath]);

            return;
        }

        $date = date('Y-m-d', $maxMtime);

        Log::info('KPI capture: writing snapshot', [
            'repo' => $repoName,
            'branch' => $branch,
            'basePath' => $basePath,
            'maxMtime' => $maxMtime,
            'date' => $date,
            'historyDir' => $basePath . DIRECTORY_SEPARATOR . '_History',
        ]);

        $kpis = $this->computeKpis($basePath);

        $historyDir = $basePath . DIRECTORY_SEPARATOR . '_History';
        if (! File::isDirectory($historyDir)) {
            File::makeDirectory($historyDir, 0755, true);
        }

        $payload = [
            'updated' => now()->toIso8601String(),
            '_lastFileMtime' => $maxMtime,
            'KPIs' => $kpis,
        ];

        $path = $historyDir . DIRECTORY_SEPARATOR . $date . '.json';
        $json = json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        if (file_put_contents($path, $json, LOCK_EX) === false) {
            throw new \RuntimeException('Failed to write KPI history file: ' . $path);
        }

        try {
            $gitRoot = $this->getGitRoot($basePath);
            if ($gitRoot !== null) {
                $relativePath = ltrim(substr($path, strlen($gitRoot) + 1), DIRECTORY_SEPARATOR);
                $escapedRelative = escapeshellarg($relativePath);
                exec("git -C " . escapeshellarg($gitRoot) . " add -f {$escapedRelative}", [], $exitCode);
            }
        } catch (\Throwable $e) {
            Log::debug('KPI git add skipped', ['path' => $path, 'error' => $e->getMessage()]);
        }
    }

    /**
     * Read all history files and return them as an ordered array.
     *
     * @return array<int, array{date: string, updated: string, _lastFileMtime: int, KPIs: array<string, mixed>}>
     */
    public function readHistory(string $repoName, string $branch): array
    {
        $basePath = $this->dataPathResolver->resolve($repoName, $branch, null);
        $historyDir = $basePath . DIRECTORY_SEPARATOR . '_History';

        if (! is_dir($historyDir)) {
            return [];
        }

        $files = glob($historyDir . DIRECTORY_SEPARATOR . '*.json');
        if (! is_array($files) || $files === []) {
            return [];
        }

        $history = [];
        foreach ($files as $file) {
            $raw = @file_get_contents($file);
            if ($raw === false) {
                continue;
            }
            $decoded = json_decode($raw, true);
            if (! is_array($decoded)) {
                continue;
            }
            $basename = basename($file, '.json');
            $history[] = [
                'date' => $basename,
                'updated' => $decoded['updated'] ?? '',
                '_lastFileMtime' => $decoded['_lastFileMtime'] ?? 0,
                'KPIs' => $decoded['KPIs'] ?? [],
            ];
        }

        usort($history, fn ($a, $b) => strcmp($a['date'], $b['date']));

        return $history;
    }

    /**
     * Find the latest modification time across all payload files.
     */
    public function getLatestMaxMtime(string $basePath): int
    {
        $maxMtime = 0;
        $maxFile = '';
        $fileCount = 0;

        $dirs = glob($basePath . DIRECTORY_SEPARATOR . '*', GLOB_ONLYDIR);
        if (is_array($dirs)) {
            foreach ($dirs as $dir) {
                $dirName = basename($dir);
                if ($dirName === '' || $dirName[0] === '.' || $dirName[0] === '_') {
                    continue;
                }
                $files = glob($dir . DIRECTORY_SEPARATOR . '*.json');
                if (! is_array($files)) {
                    continue;
                }
                foreach ($files as $file) {
                    $mtime = @filemtime($file);
                    if ($mtime !== false) {
                        $fileCount++;
                        if ($mtime > $maxMtime) {
                            $maxMtime = $mtime;
                            $maxFile = $file;
                        }
                    }
                }
            }
        }

        $rootFiles = glob($basePath . DIRECTORY_SEPARATOR . '*.json');
        if (is_array($rootFiles)) {
            foreach ($rootFiles as $file) {
                $mtime = @filemtime($file);
                if ($mtime !== false) {
                    $fileCount++;
                    if ($mtime > $maxMtime) {
                        $maxMtime = $mtime;
                        $maxFile = $file;
                    }
                }
            }
        }

        Log::info('KPI getLatestMaxMtime', [
            'basePath' => $basePath,
            'fileCount' => $fileCount,
            'maxMtime' => $maxMtime,
            'maxFile' => $maxFile,
            'date' => $maxMtime > 0 ? date('Y-m-d H:i:s', $maxMtime) : 'none',
        ]);

        return $maxMtime;
    }

    /**
     * Compute KPIs by iterating all entity files.
     *
     * @return array<string, mixed>
     */
    private function computeKpis(string $basePath): array
    {
        $kpis = [];
        $migrationLifecycleCounts = [];
        foreach (config('kpi.migration_lifecycle_options', []) as $opt) {
            $migrationLifecycleCounts[$opt] = 0;
        }
        $migrationTotalCount = 0;

        $dirs = glob($basePath . DIRECTORY_SEPARATOR . '*', GLOB_ONLYDIR);
        if (! is_array($dirs)) {
            $dirs = [];
        }

        foreach ($dirs as $dir) {
            $dirName = basename($dir);
            if ($dirName === '' || $dirName[0] === '.' || $dirName[0] === '_') {
                continue;
            }
            $this->computeEntityTypeKpis($dir, $dirName, $kpis, $migrationLifecycleCounts, $migrationTotalCount);
        }

        $rootFiles = glob($basePath . DIRECTORY_SEPARATOR . '*.json');
        if (is_array($rootFiles)) {
            $this->computeRootFileKpis($rootFiles, $kpis, $migrationLifecycleCounts, $migrationTotalCount);
        }

        $kpis['Migrations'] = [
            'count' => $migrationTotalCount,
            'lifecycle' => $migrationLifecycleCounts,
        ];

        return $kpis;
    }

    /**
     * Load model.json custom field definitions for an entity type directory.
     *
     * @return array<string, array{type: string, values?: string[]}>
     */
    private function loadCustomFieldDefs(string $dir): array
    {
        $modelPath = $dir . DIRECTORY_SEPARATOR . 'model.json';
        if (! is_file($modelPath)) {
            return [];
        }
        $raw = @file_get_contents($modelPath);
        if ($raw === false) {
            return [];
        }
        $model = json_decode($raw, true);
        if (! is_array($model) || ! isset($model['customFields']) || ! is_array($model['customFields'])) {
            return [];
        }

        $defs = [];
        foreach ($model['customFields'] as $key => $def) {
            if (! is_array($def) || ! isset($def['type'])) {
                continue;
            }
            $defs[$key] = [
                'type' => $def['type'],
                'values' => $def['values'] ?? [],
            ];
        }

        return $defs;
    }

    /**
     * Compute KPIs for all files in a single entity type directory.
     *
     * @param array<string, mixed> $kpis
     * @param array<string, int> $migrationLifecycleCounts
     */
    private function computeEntityTypeKpis(
        string $dir,
        string $typeName,
        array &$kpis,
        array &$migrationLifecycleCounts,
        int &$migrationTotalCount,
    ): void {
        $files = glob($dir . DIRECTORY_SEPARATOR . '*.json');
        if (! is_array($files) || $files === []) {
            $kpis[$typeName] = ['count' => 0];
            return;
        }

        $isApplication = ($typeName === 'Application');
        $customFieldDefs = $isApplication ? $this->loadCustomFieldDefs($dir) : [];

        $activeCount = 0;
        $stringFacetCounts = [];
        $relationFacetCounts = [];
        $statusCounts = [];
        $customNumericSums = [];
        $customNumericCounts = [];
        $customSelectCounts = [];

        foreach ($this->stringFacetKeys as $key) {
            $stringFacetCounts[$key] = [];
        }
        foreach ($this->relationKeys as $key) {
            $relationFacetCounts[$key] = [];
        }
        foreach (array_keys($customFieldDefs) as $key) {
            $customSelectCounts[$key] = [];
        }

        foreach ($files as $file) {
            $raw = @file_get_contents($file);
            if ($raw === false) {
                continue;
            }
            $entity = json_decode($raw, true);
            if (! is_array($entity)) {
                continue;
            }

            $status = $entity['status'] ?? null;
            $isActive = is_string($status) && $status === 'ACTIVE';

            if (is_string($status) && $status !== '') {
                $statusCounts[$status] = ($statusCounts[$status] ?? 0) + 1;
            }

            if ($isApplication) {
                $this->collectMigrationTargetCounts($entity, $migrationLifecycleCounts, $migrationTotalCount);
            }

            if (! $isActive) {
                continue;
            }

            $activeCount++;

            $this->collectStringFacetCounts($entity, $stringFacetCounts);

            if ($isApplication) {
                $this->collectRelationFacetCounts($entity, $relationFacetCounts);
                $this->collectCustomFieldCounts($entity, $customFieldDefs, $customNumericSums, $customNumericCounts, $customSelectCounts);
            }
        }

        $typeKpi = ['count' => $activeCount];

        if ($isApplication) {
            $typeKpi['_DefaultConstraint'] = 'ACTIVE';
        }

        if ($isApplication) {
            $typeKpi['status'] = array_merge(
                ['ACTIVE' => 0, 'INACTIVE' => 0, 'ARCHIVED' => 0],
                $statusCounts,
            );
        } elseif ($statusCounts !== []) {
            $typeKpi['status'] = $statusCounts;
        }

        foreach ($this->stringFacetKeys as $key) {
            if ($stringFacetCounts[$key] !== []) {
                $typeKpi[$key] = $stringFacetCounts[$key];
            }
        }

        if ($isApplication) {
            foreach ($this->relationKeys as $key) {
                if ($relationFacetCounts[$key] !== []) {
                    $typeKpi[$key] = $relationFacetCounts[$key];
                }
            }

            foreach ($customFieldDefs as $fieldKey => $fieldDef) {
                $fieldType = $fieldDef['type'];

                if ($fieldType === 'number' && isset($customNumericSums[$fieldKey])) {
                    $sum = $customNumericSums[$fieldKey];
                    $cnt = $customNumericCounts[$fieldKey];
                    $typeKpi[$fieldKey] = [
                        'sum' => $sum,
                        'avg' => $cnt > 0 ? round($sum / $cnt, 2) : 0,
                    ];
                } elseif (($fieldType === 'selectSingle' || $fieldType === 'selectMultiple') && isset($customSelectCounts[$fieldKey]) && $customSelectCounts[$fieldKey] !== []) {
                    $typeKpi[$fieldKey] = $customSelectCounts[$fieldKey];
                }
            }
        }

        $kpis[$typeName] = $typeKpi;
    }

    /**
     * Compute KPIs for root-level JSON files (legacy layout).
     *
     * @param array<int, string> $files
     * @param array<string, mixed> $kpis
     * @param array<string, int> $migrationLifecycleCounts
     */
    private function computeRootFileKpis(
        array $files,
        array &$kpis,
        array &$migrationLifecycleCounts,
        int &$migrationTotalCount,
    ): void {
        $typeActiveCounts = [];
        $typeStringFacetCounts = [];
        $typeRelationFacetCounts = [];
        $typeStatusCounts = [];

        foreach ($files as $file) {
            $raw = @file_get_contents($file);
            if ($raw === false) {
                continue;
            }
            $entity = json_decode($raw, true);
            if (! is_array($entity)) {
                continue;
            }

            $typeName = $entity['type'] ?? null;
            if (! is_string($typeName) || $typeName === '') {
                continue;
            }

            $status = $entity['status'] ?? null;
            $isActive = is_string($status) && $status === 'ACTIVE';

            if (is_string($status) && $status !== '') {
                $typeStatusCounts[$typeName][$status] = ($typeStatusCounts[$typeName][$status] ?? 0) + 1;
            }

            if ($typeName === 'Application') {
                $this->collectMigrationTargetCounts($entity, $migrationLifecycleCounts, $migrationTotalCount);
            }

            if (! $isActive) {
                continue;
            }

            $typeActiveCounts[$typeName] = ($typeActiveCounts[$typeName] ?? 0) + 1;

            if (! isset($typeStringFacetCounts[$typeName])) {
                $typeStringFacetCounts[$typeName] = [];
                foreach ($this->stringFacetKeys as $key) {
                    $typeStringFacetCounts[$typeName][$key] = [];
                }
            }
            $this->collectStringFacetCounts($entity, $typeStringFacetCounts[$typeName]);

            if ($typeName === 'Application') {
                if (! isset($typeRelationFacetCounts[$typeName])) {
                    $typeRelationFacetCounts[$typeName] = [];
                    foreach ($this->relationKeys as $key) {
                        $typeRelationFacetCounts[$typeName][$key] = [];
                    }
                }
                $this->collectRelationFacetCounts($entity, $typeRelationFacetCounts[$typeName]);
            }
        }

        foreach ($typeActiveCounts as $typeName => $count) {
            $typeKpi = ['count' => $count];

            if ($typeName === 'Application') {
                $typeKpi['_DefaultConstraint'] = 'ACTIVE';
            }

            if ($typeName === 'Application') {
                $typeKpi['status'] = array_merge(
                    ['ACTIVE' => 0, 'INACTIVE' => 0, 'ARCHIVED' => 0],
                    $typeStatusCounts[$typeName] ?? [],
                );
            } elseif (isset($typeStatusCounts[$typeName]) && $typeStatusCounts[$typeName] !== []) {
                $typeKpi['status'] = $typeStatusCounts[$typeName];
            }

            if (isset($typeStringFacetCounts[$typeName])) {
                foreach ($this->stringFacetKeys as $key) {
                    if ($typeStringFacetCounts[$typeName][$key] !== []) {
                        $typeKpi[$key] = $typeStringFacetCounts[$typeName][$key];
                    }
                }
            }

            if ($typeName === 'Application' && isset($typeRelationFacetCounts[$typeName])) {
                foreach ($this->relationKeys as $key) {
                    if ($typeRelationFacetCounts[$typeName][$key] !== []) {
                        $typeKpi[$key] = $typeRelationFacetCounts[$typeName][$key];
                    }
                }
            }

        $targetKey = $typeName;
            if (isset($kpis[$targetKey]) && is_array($kpis[$targetKey])) {
                $existing = $kpis[$targetKey];
                $merged = $typeKpi;
                foreach ($existing as $k => $v) {
                    if (! isset($merged[$k])) {
                        $merged[$k] = $v;
                    } elseif (is_array($v) && is_array($merged[$k])) {
                        foreach ($v as $vk => $vv) {
                            if (is_int($vv) && isset($merged[$k][$vk]) && is_int($merged[$k][$vk])) {
                                $merged[$k][$vk] += $vv;
                            } elseif (! isset($merged[$k][$vk])) {
                                $merged[$k][$vk] = $vv;
                            }
                        }
                    }
                }
                $kpis[$typeName] = $merged;
            } else {
                $kpis[$typeName] = $typeKpi;
            }
        }
    }

    /**
     * Count string facet values for an entity.
     *
     * @param array<string, mixed> $entity
     * @param array<string, array<string, int>> $facetCounts
     */
    private function collectStringFacetCounts(array $entity, array &$facetCounts): void
    {
        foreach ($this->stringFacetKeys as $key) {
            if ($key === 'ApplicationLifecycle') {
                continue;
            }
            $value = $entity[$key] ?? null;
            if (is_string($value) && $value !== '') {
                $facetCounts[$key][$value] = ($facetCounts[$key][$value] ?? 0) + 1;
            }
        }

        $lifecycle = $entity['ApplicationLifecycle'] ?? null;
        if (is_array($lifecycle)) {
            $asString = $lifecycle['asString'] ?? null;
            if (is_string($asString) && $asString !== '') {
                $facetCounts['ApplicationLifecycle'][$asString] = ($facetCounts['ApplicationLifecycle'][$asString] ?? 0) + 1;
            }
        }
    }

    /**
     * Count relation facet references for an Application entity.
     *
     * @param array<string, mixed> $entity
     * @param array<string, array<string, int>> $relationCounts
     */
    private function collectRelationFacetCounts(array $entity, array &$relationCounts): void
    {
        foreach ($this->relationKeys as $key) {
            $rel = $entity[$key] ?? null;
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
                if (is_string($id) && $id !== '') {
                    $relationCounts[$key][$id] = ($relationCounts[$key][$id] ?? 0) + 1;
                }
            }
        }
    }

    /**
     * Count migration targets for an Application entity.
     *
     * @param array<string, mixed> $entity
     * @param array<string, int> $lifecycleCounts
     */
    private function collectMigrationTargetCounts(array $entity, array &$lifecycleCounts, int &$totalCount): void
    {
        $mt = $entity['migrationTarget'] ?? null;
        if (! is_array($mt)) {
            return;
        }

        if (isset($mt['edges']) && is_array($mt['edges'])) {
            foreach ($mt['edges'] as $edge) {
                $totalCount++;
                $lifecycle = $edge['lifecycle'] ?? null;
                if (is_string($lifecycle) && isset($lifecycleCounts[$lifecycle])) {
                    $lifecycleCounts[$lifecycle]++;
                }
            }
            return;
        }

        if (is_array($mt)) {
            foreach ($mt as $item) {
                if (! is_array($item)) {
                    continue;
                }
                $totalCount++;
                $lifecycle = $item['lifecycle'] ?? null;
                if (is_string($lifecycle) && isset($lifecycleCounts[$lifecycle])) {
                    $lifecycleCounts[$lifecycle]++;
                }
            }
        }
    }

    /**
     * Collect custom field statistics for an Application entity.
     *
     * @param array<string, mixed> $entity
     * @param array<string, array{type: string, values?: string[]}> $customFieldDefs
     * @param array<string, float|int> $numericSums
     * @param array<string, int> $numericCounts
     * @param array<string, array<string, int>> $selectCounts
     */
    private function collectCustomFieldCounts(
        array $entity,
        array $customFieldDefs,
        array &$numericSums,
        array &$numericCounts,
        array &$selectCounts,
    ): void {
        foreach ($customFieldDefs as $fieldKey => $fieldDef) {
            $value = $entity[$fieldKey] ?? null;
            if ($value === null || $value === '' || $value === false) {
                continue;
            }

            $fieldType = $fieldDef['type'];

            if ($fieldType === 'number') {
                $num = is_numeric($value) ? (float) $value : null;
                if ($num !== null) {
                    $numericSums[$fieldKey] = ($numericSums[$fieldKey] ?? 0) + $num;
                    $numericCounts[$fieldKey] = ($numericCounts[$fieldKey] ?? 0) + 1;
                }
            } elseif ($fieldType === 'selectSingle') {
                if (is_string($value) && $value !== '') {
                    $selectCounts[$fieldKey][$value] = ($selectCounts[$fieldKey][$value] ?? 0) + 1;
                }
            } elseif ($fieldType === 'selectMultiple') {
                $values = null;
                if (is_string($value)) {
                    $values = array_filter(array_map('trim', explode(',', $value)));
                } elseif (is_array($value)) {
                    $values = $value;
                }
                if (is_array($values)) {
                    foreach ($values as $v) {
                        if (is_string($v) && $v !== '') {
                            $selectCounts[$fieldKey][$v] = ($selectCounts[$fieldKey][$v] ?? 0) + 1;
                        }
                    }
                }
            }
        }
    }

    private function getGitRoot(string $startDir): ?string
    {
        $dir = $startDir;
        while ($dir !== '/' && $dir !== '') {
            if (is_dir($dir . DIRECTORY_SEPARATOR . '.git')) {
                return $dir;
            }
            $parent = dirname($dir);
            if ($parent === $dir) {
                break;
            }
            $dir = $parent;
        }

        return null;
    }
}
