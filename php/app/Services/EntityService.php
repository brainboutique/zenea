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
use InvalidArgumentException;

class EntityService
{
    private const PLURAL_MAP = [
        'Application' => 'applications',
        'BusinessCapability' => 'businessCapabilities',
        'DataProduct' => 'dataProducts',
        'ITComponent' => 'iTComponents',
        'Platform' => 'platforms',
        'UserGroup' => 'userGroups',
    ];

    private const CACHE_TTL_DAYS = 1;

    private string $dataPath;

    public function __construct()
    {
        $this->dataPath = config('data.path');
    }

    private function resolvePath(?string $dataPath): string
    {
        return $dataPath !== null && $dataPath !== '' ? $dataPath : $this->dataPath;
    }

    private function getPluralName(string $type): string
    {
        if (! isset(self::PLURAL_MAP[$type])) {
            throw new InvalidArgumentException("Unsupported entity type: {$type}");
        }

        return self::PLURAL_MAP[$type];
    }

    private function getMetaFilePath(?string $dataPath, string $type): string
    {
        $path = $this->resolvePath($dataPath);

        return $path . DIRECTORY_SEPARATOR . '.meta' . DIRECTORY_SEPARATOR . $this->getPluralName($type) . '.json';
    }

    /**
     * Get entity list document. Uses cached file if present and _updated is within TTL;
     * otherwise rebuilds and returns fresh data.
     *
     * @return array{_updated: string, [key: string]: list<array{id: string, displayName: string}>}
     */
    public function getCached(string $type, ?string $dataPath = null): array
    {
        $this->assertSupportedType($type);
        $cached = $this->readMetaFile($type, $dataPath);
        $pluralName = $this->getPluralName($type);

        if ($cached !== null && $this->isWithinTtl($cached['_updated'] ?? null, self::CACHE_TTL_DAYS)) {
            if (isset($cached[$pluralName])) {
                return $cached;
            }
        }

        return $this->rebuild($type, $dataPath);
    }

    /**
     * Rebuild entity list from JSON files and write to .meta/{pluralName}.json.
     * Reads from type-specific subdirectory first, then falls back to base path for backward compatibility.
     * Includes only entities with matching type and status === "ACTIVE".
     *
     * @return array{_updated: string, [key: string]: list<array{id: string, displayName: string}>}
     */
    public function rebuild(string $type, ?string $dataPath = null): array
    {
        $this->assertSupportedType($type);
        $basePath = $this->resolvePath($dataPath);
        $entities = [];

        $typeDir = $basePath . DIRECTORY_SEPARATOR . $type;
        $files = [];

        if (is_dir($typeDir)) {
            $typeDirFiles = glob($typeDir . DIRECTORY_SEPARATOR . '*.json');
            if ($typeDirFiles !== false) {
                $files = array_merge($files, $typeDirFiles);
            }
        }

        $baseFiles = glob($basePath . DIRECTORY_SEPARATOR . '*.json');
        if ($baseFiles !== false) {
            $files = array_merge($files, $baseFiles);
        }

        $seen = [];
        foreach ($files as $path) {
            $raw = @file_get_contents($path);
            if ($raw === false) {
                continue;
            }
            $decoded = json_decode($raw, true);
            if (! is_array($decoded)) {
                continue;
            }
            $entityType = $decoded['type'] ?? null;
            $status = $decoded['status'] ?? null;
            if ($entityType !== $type || $status !== 'ACTIVE') {
                continue;
            }
            $id = $decoded['id'] ?? null;
            if ($id === null || $id === '') {
                continue;
            }
            if (isset($seen[$id])) {
                continue;
            }
            $seen[$id] = true;

            $entities[] = [
                'id' => (string) $id,
                'displayName' => (string) ($decoded['displayName'] ?? ''),
            ];
        }

        $pluralName = $this->getPluralName($type);
        $data = [
            '_updated' => now()->toIso8601String(),
            $pluralName => $entities,
        ];

        $this->writeMetaFile($data, $type, $dataPath);

        return $data;
    }

    private function readMetaFile(string $type, ?string $dataPath): ?array
    {
        $path = $this->getMetaFilePath($dataPath, $type);
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

    private function writeMetaFile(array $data, string $type, ?string $dataPath): void
    {
        $path = $this->getMetaFilePath($dataPath, $type);
        $metaDir = dirname($path);
        if (! File::isDirectory($metaDir)) {
            File::makeDirectory($metaDir, 0755, true);
        }
        $json = json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        if (file_put_contents($path, $json, LOCK_EX) === false) {
            throw new \RuntimeException("Failed to write {$type} meta file.");
        }
    }

    public function invalidate(string $type, ?string $dataPath = null): void
    {
        $this->assertSupportedType($type);
        $path = $this->getMetaFilePath($dataPath, $type);
        if (is_file($path)) {
            @unlink($path);
        }
    }

    private function assertSupportedType(string $type): void
    {
        if (! isset(self::PLURAL_MAP[$type])) {
            throw new InvalidArgumentException(
                'Unsupported entity type. Use one of: ' . implode(', ', array_keys(self::PLURAL_MAP)) . '.'
            );
        }
    }
}
