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

class ConfigurationService
{
    private string $dataPath;

    private const META_FILENAME = '.meta.json';

    /** Default configuration when .meta.json does not exist */
    private const DEFAULT_CONFIGURATION = [
        'defaultRepositoryName' => 'local',
        'defaultBranch' => 'default',
    ];

    public function __construct()
    {
        $this->dataPath = rtrim((string) config('data.path', base_path('../data')), DIRECTORY_SEPARATOR);
    }

    /**
     * Path to the meta configuration file.
     */
    private function metaFilePath(): string
    {
        return $this->dataPath . DIRECTORY_SEPARATOR . self::META_FILENAME;
    }

    /**
     * Ensure the data directory and default repo/branch directories exist.
     * Creates /data, /data/local, and /data/local/default when missing.
     */
    private function ensureDataAndDefaultDirectories(): void
    {
        if (! File::isDirectory($this->dataPath)) {
            File::makeDirectory($this->dataPath, 0755, true);
        }
        $defaultRepo = $this->dataPath . DIRECTORY_SEPARATOR . 'local';
        if (! File::isDirectory($defaultRepo)) {
            File::makeDirectory($defaultRepo, 0755, true);
        }
        $defaultBranch = $defaultRepo . DIRECTORY_SEPARATOR . 'default';
        if (! File::isDirectory($defaultBranch)) {
            File::makeDirectory($defaultBranch, 0755, true);
        }
    }

    /**
     * Read configuration from /data/.meta.json and return as object (associative array).
     * If the file does not exist, creates it with default values, ensures /data/local/default
     * directories exist, and returns the default configuration.
     *
     * @return array<string, mixed>
     */
    public function getConfiguration(): array
    {
        $path = $this->metaFilePath();

        if (! is_file($path)) {
            $this->ensureDataAndDefaultDirectories();
            $json = json_encode(self::DEFAULT_CONFIGURATION, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
            if (file_put_contents($path, $json, LOCK_EX) === false) {
                throw new \RuntimeException('Failed to create configuration file: ' . $path);
            }

            return self::DEFAULT_CONFIGURATION;
        }

        $raw = @file_get_contents($path);
        if ($raw === false) {
            throw new \RuntimeException('Failed to read configuration file: ' . $path);
        }

        $decoded = json_decode($raw, true);
        if (! is_array($decoded)) {
            throw new \RuntimeException('Invalid JSON in configuration file: ' . $path);
        }

        return $decoded;
    }

    /**
     * Update configuration with the given key-value pairs, then write back to /data/.meta.json.
     * Reads existing configuration (or creates default if missing), merges updates, and saves.
     *
     * @param  array<string, mixed>  $updates  Dictionary of attribute names to new values
     * @return array<string, mixed>  The configuration after update
     */
    public function updateConfiguration(array $updates): array
    {
        $config = $this->getConfiguration();

        foreach ($updates as $key => $value) {
            $config[$key] = $value;
        }

        $path = $this->metaFilePath();
        $this->ensureDataAndDefaultDirectories();
        $json = json_encode($config, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        if (file_put_contents($path, $json, LOCK_EX) === false) {
            throw new \RuntimeException('Failed to write configuration file: ' . $path);
        }

        return $config;
    }
}
