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

class ApplicationsService
{
    private string $dataPath;

    private string $applicationsPath;

    private const CACHE_TTL_DAYS = 1;

    public function __construct()
    {
        $this->dataPath = config('data.path');
        $this->applicationsPath = $this->dataPath . DIRECTORY_SEPARATOR . '.meta' . DIRECTORY_SEPARATOR . 'applications.json';
    }

    private function resolvePath(?string $dataPath): string
    {
        return $dataPath !== null && $dataPath !== '' ? $dataPath : $this->dataPath;
    }

    private function applicationsPathFor(?string $dataPath): string
    {
        $path = $this->resolvePath($dataPath);
        return $path . DIRECTORY_SEPARATOR . '.meta' . DIRECTORY_SEPARATOR . 'applications.json';
    }

    /**
     * Get applications document. Uses cached file if present and _updated is within TTL;
     * otherwise rebuilds and returns fresh data.
     *
     * @return array{_updated: string, applications: list<array{id: string, displayName: string, lxTimeClassification?: string}>}
     */
    public function getCached(?string $dataPath = null): array
    {
        $cached = $this->readApplicationsFile($dataPath);

        if ($cached !== null && $this->isWithinTtl($cached['_updated'] ?? null, self::CACHE_TTL_DAYS)) {
            // If cache was built before lxTimeClassification was added, rebuild to expose it in the API
            $apps = $cached['applications'] ?? [];
            $first = $apps[0] ?? [];
            if (! isset($first['lxTimeClassification'])) {
                return $this->rebuild($dataPath);
            }

            return $cached;
        }

        return $this->rebuild($dataPath);
    }

    /**
     * Rebuild applications list from all JSON files in data and write to data/.meta/applications.json.
     * Includes only entities with type === "Application" and status === "ACTIVE".
     *
     * @return array{_updated: string, applications: list<array{id: string, displayName: string, lxTimeClassification?: string}>}
     */
    public function rebuild(?string $dataPath = null): array
    {
        $basePath = $this->resolvePath($dataPath);
        $applications = [];

        $files = glob($basePath . DIRECTORY_SEPARATOR . '*.json');
        if ($files === false) {
            $files = [];
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
            $type = $decoded['type'] ?? null;
            $status = $decoded['status'] ?? null;
            if ($type !== 'Application' || $status !== 'ACTIVE') {
                continue;
            }
            $id = $decoded['id'] ?? null;
            if ($id === null || $id === '') {
                continue;
            }
            $lxTime = $decoded['lxTimeClassification'] ?? null;
            $applications[] = array_filter([
                'id' => (string) $id,
                'displayName' => (string) ($decoded['displayName'] ?? ''),
                'lxTimeClassification' => is_string($lxTime) && $lxTime !== '' ? $lxTime : null,
            ], fn ($v) => $v !== null && $v !== '');
        }

        $data = [
            '_updated' => now()->toIso8601String(),
            'applications' => $applications,
        ];

        $this->writeApplicationsFile($data, $dataPath);

        return $data;
    }

    private function readApplicationsFile(?string $dataPath = null): ?array
    {
        $path = $this->applicationsPathFor($dataPath);
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
     * @param array{_updated: string, applications: list<array{id: string, displayName: string, lxTimeClassification?: string}>} $data
     */
    private function writeApplicationsFile(array $data, ?string $dataPath = null): void
    {
        $path = $this->applicationsPathFor($dataPath);
        $metaDir = dirname($path);
        if (! File::isDirectory($metaDir)) {
            File::makeDirectory($metaDir, 0755, true);
        }
        $json = json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        if (file_put_contents($path, $json, LOCK_EX) === false) {
            throw new \RuntimeException('Failed to write applications file.');
        }
    }

    /**
     * Invalidate the cached applications file for the given data path (or default path).
     * The file will be lazily re-created on next access via getCached()/rebuild().
     */
    public function invalidate(?string $dataPath = null): void
    {
        $path = $this->applicationsPathFor($dataPath);
        if (is_file($path)) {
            @unlink($path);
        }
    }
}
