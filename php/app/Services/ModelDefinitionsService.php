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

class ModelDefinitionsService
{
    public function __construct(
        private SupportEntityTypesService $supportEntityTypesService
    ) {
    }

    /**
     * Load _model.json from each entity type directory under the given base path.
     *
     * @return array<string, array> keyed by entity type name
     */
    public function loadAll(string $basePath): array
    {
        $result = [];

        foreach ($this->supportEntityTypesService->all() as $type) {
            $modelPath = $basePath . DIRECTORY_SEPARATOR . $type . DIRECTORY_SEPARATOR . 'model.json';

            if (File::exists($modelPath)) {
                $raw = File::get($modelPath);
                $decoded = json_decode($raw, true);

                if (is_array($decoded)) {
                    $result[$type] = $decoded;
                }
            }
        }

        return $result;
    }
}
