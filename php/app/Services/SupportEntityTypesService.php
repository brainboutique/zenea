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

class SupportEntityTypesService
{
    public const SUPPORTED_ENTITY_TYPES = [
        'Application',
        'UserGroup',
        'BusinessCapability',
        'DataProduct',
        'Platform',
        'ITComponent',
    ];

    /**
     * @return array<int, string>
     */
    public function all(): array
    {
        return self::SUPPORTED_ENTITY_TYPES;
    }

    public function isSupported(?string $type): bool
    {
        if ($type === null) return false;
        $t = trim($type);
        if ($t === '') return false;
        return in_array($t, self::SUPPORTED_ENTITY_TYPES, true);
    }

    public function assertSupported(?string $type): string
    {
        if (! $this->isSupported($type)) {
            throw new InvalidArgumentException('Unsupported entity type. Use only: ' . implode(', ', self::SUPPORTED_ENTITY_TYPES) . '.');
        }
        return trim((string) $type);
    }
}

