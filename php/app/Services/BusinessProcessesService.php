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

class BusinessProcessesService
{
    private string $dataPath;

    private const CACHE_TTL_DAYS = 1;

    private const TYPE_DIR = 'Process';

    public function __construct(
        private readonly AuditLogService $auditLogService,
    ) {
        $this->dataPath = config('data.path');
    }

    private function resolvePath(?string $dataPath): string
    {
        return $dataPath !== null && $dataPath !== '' ? $dataPath : $this->dataPath;
    }

    private function metaPathFor(?string $dataPath): string
    {
        $path = $this->resolvePath($dataPath);

        return $path . DIRECTORY_SEPARATOR . '.meta' . DIRECTORY_SEPARATOR . 'businessProcesses.json';
    }

    private function typeDirFor(?string $dataPath): string
    {
        return $this->resolvePath($dataPath) . DIRECTORY_SEPARATOR . self::TYPE_DIR;
    }

    /**
     * Get business processes document. Uses cached file if present and _updated is within TTL;
     * otherwise rebuilds and returns fresh data.
     *
     * @return array{_updated: string, businessProcesses: list<array{id: string, name: string, entityType?: string, category?: string}>}
     */
    public function getCached(?string $dataPath = null): array
    {
        $cached = $this->readMetaFile($dataPath);

        if ($cached !== null && $this->isWithinTtl($cached['_updated'] ?? null, self::CACHE_TTL_DAYS)) {
            return $cached;
        }

        return $this->rebuild($dataPath);
    }

    /**
     * Rebuild business processes list from all JSON files in Process/ directory
     * and write to data/.meta/businessProcesses.json.
     * Includes only entities with type === "BP".
     *
     * @return array{_updated: string, businessProcesses: list<array{id: string, name: string, entityType?: string, category?: string}>}
     */
    public function rebuild(?string $dataPath = null): array
    {
        $typeDir = $this->typeDirFor($dataPath);
        $entities = [];

        if (is_dir($typeDir)) {
            $files = glob($typeDir . DIRECTORY_SEPARATOR . '*.json');
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
                if ($type !== 'BP') {
                    continue;
                }
                $id = $decoded['id'] ?? null;
                if ($id === null || $id === '') {
                    continue;
                }
                $entities[] = array_filter([
                    'id' => (string) $id,
                    'name' => (string) ($decoded['name'] ?? ''),
                    'entityType' => isset($decoded['entityType']) ? (string) $decoded['entityType'] : null,
                    'category' => isset($decoded['category']) ? (string) $decoded['category'] : null,
                ], fn ($v) => $v !== null && $v !== '');
            }
        }

        $data = [
            '_updated' => now()->toIso8601String(),
            'businessProcesses' => $entities,
        ];

        $this->writeMetaFile($data, $dataPath);

        return $data;
    }

    /**
     * Get a single business process by GUID from the Process/ directory.
     */
    public function get(string $guid, ?string $dataPath = null): ?array
    {
        $typeDir = $this->typeDirFor($dataPath);
        $path = $typeDir . DIRECTORY_SEPARATOR . $guid . '.json';

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
     * Create or update a business process by GUID in the Process/ directory.
     *
     * @param  array<string, mixed>  $data
     */
    public function put(string $guid, array $data, ?string $dataPath = null, ?string $username = null): void
    {
        $resolvedPath = $this->resolvePath($dataPath);

        $repoBranchPath = AuditLogService::repoBranchPath($resolvedPath);
        $this->auditLogService->autoCommitIfNeeded($repoBranchPath);

        $typeDir = $this->typeDirFor($dataPath);
        if (! File::isDirectory($typeDir)) {
            File::makeDirectory($typeDir, 0755, true);
        }

        $data['id'] = $guid;
        $path = $typeDir . DIRECTORY_SEPARATOR . $guid . '.json';

        $normalized = $this->normalizeEntityData($data);
        $json = json_encode($normalized, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);

        if (file_put_contents($path, $json, LOCK_EX) === false) {
            throw new \RuntimeException('Failed to write business process file.');
        }

        $this->invalidate($dataPath);

        if ($username !== null) {
            $this->auditLogService->logChange($repoBranchPath, $username, 'BusinessProcess', $guid);
        }
    }

    /**
     * Recursively normalize a JSON-like value to a canonical form.
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
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function normalizeEntityData(array $data): array
    {
        /** @var array<string, mixed> $normalized */
        $normalized = $this->normalizeJsonValue($data);

        return $normalized;
    }

    private function readMetaFile(?string $dataPath = null): ?array
    {
        $path = $this->metaPathFor($dataPath);
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
     * @param array{_updated: string, businessProcesses: list<array{id: string, name: string, entityType?: string, category?: string}>} $data
     */
    private function writeMetaFile(array $data, ?string $dataPath = null): void
    {
        $path = $this->metaPathFor($dataPath);
        $metaDir = dirname($path);
        if (! File::isDirectory($metaDir)) {
            File::makeDirectory($metaDir, 0755, true);
        }
        $json = json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        if (file_put_contents($path, $json, LOCK_EX) === false) {
            throw new \RuntimeException('Failed to write business processes file.');
        }
    }

    /**
     * Invalidate the cached business processes file for the given data path (or default path).
     * The file will be lazily re-created on next access via getCached()/rebuild().
     */
    public function invalidate(?string $dataPath = null): void
    {
        $path = $this->metaPathFor($dataPath);
        if (is_file($path)) {
            @unlink($path);
        }
    }
}
