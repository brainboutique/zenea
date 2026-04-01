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

use InvalidArgumentException;

class DataPathResolver
{
    /** Segment pattern: alphanumeric, hyphen, underscore, period (no path traversal). */
    private const SEGMENT_PATTERN = '#^[a-zA-Z0-9_.-]+$#';

    public function __construct()
    {
    }

    /**
     * Resolve the absolute data path from optional repo, branch and type.
     * When repoName/branch are null/empty: returns data_root/local/default.
     * When repoName/branch are set: returns data_root/repoName/branch (validated), including local/default.
     * When type is provided: appends /{type} as an additional validated segment.
     *
     * @throws InvalidArgumentException if repoName, branch or type contain invalid characters
     */
    public function resolve(?string $repoName, ?string $branch, ?string $type = null): string
    {
        $dataRoot = rtrim((string) config('data.path', base_path('../data')), DIRECTORY_SEPARATOR);

        $repoName = $repoName !== null ? trim($repoName) : '';
        $branch = $branch !== null ? trim($branch) : '';

        // No repo/branch provided: fallback to /data/local/default
        if ($repoName === '' || $branch === '') {
            $basePath = $dataRoot . DIRECTORY_SEPARATOR . 'local' . DIRECTORY_SEPARATOR . 'default';
        } else {
            if (! preg_match(self::SEGMENT_PATTERN, $repoName)) {
                throw new InvalidArgumentException('Invalid repo name. Use only letters, digits, dots, hyphens, and underscores.');
            }
            if (! preg_match(self::SEGMENT_PATTERN, $branch)) {
                throw new InvalidArgumentException('Invalid branch name. Use only letters, digits, dots, hyphens, and underscores.');
            }

            $basePath = $dataRoot . DIRECTORY_SEPARATOR . $repoName . DIRECTORY_SEPARATOR . $branch;
        }

        $type = $type !== null ? trim($type) : '';
        if ($type !== '') {
            if (! preg_match(self::SEGMENT_PATTERN, $type)) {
                throw new InvalidArgumentException('Invalid type segment. Use only letters, digits, dots, hyphens, and underscores.');
            }
            $basePath .= DIRECTORY_SEPARATOR . $type;
        }

        return $basePath;
    }
}
