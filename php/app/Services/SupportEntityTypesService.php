<?php

namespace App\Services;

use InvalidArgumentException;

class SupportEntityTypesService
{
    public const SUPPORTED_ENTITY_TYPES = [
        'Application',
        'UserGroup',
        'BusinessCapability',
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

