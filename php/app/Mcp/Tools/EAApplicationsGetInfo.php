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

namespace App\Mcp\Tools;

use App\Services\DataPathResolver;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\File;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\ResponseFactory;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsIdempotent;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[IsIdempotent]
#[IsReadOnly]
#[Name('ea-applications-getinfo')]
#[Description('This tool provides read-only access to a filterable list of application fact sheets existing in the enterprise. Information about all the applications existing. It should be used whenever the user requests information or summaries on applications, tools or information systems.')]
class EAApplicationsGetInfo extends Tool
{
    /**
     * Handle the tool request.
     */
    public function handle(Request $request): ResponseFactory
    {
        $repoName = $request->get('repositoryName') ?? 'local';
        $branch = $request->get('branch') ?? 'default';
        $filterBusinessCapability = $request->get('filterBusinessCapability');
        $filterDisplayName = $request->get('filterDisplayName');

        $filterBusinessCapability = is_string($filterBusinessCapability) ? trim($filterBusinessCapability) : null;
        $filterDisplayName = is_string($filterDisplayName) ? trim($filterDisplayName) : null;

        $filterBusinessCapability = $filterBusinessCapability !== '' ? strtolower($filterBusinessCapability) : null;
        $filterDisplayName = $filterDisplayName !== '' ? strtolower($filterDisplayName) : null;

        $resolver = app(DataPathResolver::class);
        $dir = $resolver->resolve($repoName, $branch, null);

        $applications = [];

        if (File::isDirectory($dir)) {
            $jsonFiles = File::glob($dir . DIRECTORY_SEPARATOR . '*.json');
            foreach ($jsonFiles as $path) {
                $content = File::get($path);
                $decoded = json_decode($content, true);
                if (! is_array($decoded)) {
                    continue;
                }
                $id = $decoded['id'] ?? null;
                $displayName = $decoded['displayName'] ?? null;
                $description = $decoded['description'] ?? null;

                if ($id === null || $displayName === null) {
                    continue;
                }

                if ($filterDisplayName !== null) {
                    $candidate = strtolower((string) $displayName);
                    if (! str_contains($candidate, $filterDisplayName)) {
                        continue;
                    }
                }

                if ($filterBusinessCapability !== null) {
                    $edges = $decoded['relApplicationToBusinessCapability']['edges'] ?? null;
                    $matches = false;
                    if (is_array($edges)) {
                        foreach ($edges as $edge) {
                            if (! is_array($edge)) {
                                continue;
                            }
                            $capName = $edge['node']['factSheet']['displayName']
                                ?? $edge['node']['factSheet']['fullName']
                                ?? null;
                            if (! is_string($capName) || $capName === '') {
                                continue;
                            }
                            if (str_contains(strtolower($capName), $filterBusinessCapability)) {
                                $matches = true;
                                break;
                            }
                        }
                    }
                    if (! $matches) {
                        continue;
                    }
                }

                $applications[] = array_filter([
                    'id' => $id,
                    'displayName' => $displayName,
                    'description' => $description,
                ], fn ($v) => $v !== null);
            }
        }

        return Response::structured(['applications' => $applications]);
    }

    /**
     * Get the tool's input schema.
     *
     * @return array<string, JsonSchema>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'repositoryName' => $schema->string()
                ->description('Name of the repository to access"')
                ->nullable(),
            'branch' => $schema->string()
                ->description('Branch name to be used')
                ->nullable(),
            'filterBusinessCapability' => $schema->string()
                ->description('Name of a business capability, for example "Logistics Execution", to filter for. May be omitted to retrieve all applications.')
                ->nullable(),
            'filterDisplayName' => $schema->string()
                ->description('Name of an application, for example "SAP", to filter for. May be omitted to retrieve all applications.')
                ->nullable(),
        ];
    }

    /**
     * Get the tool's output schema.
     *
     * @return array<string, \Illuminate\JsonSchema\Types\Type>
     */
    public function outputSchema(JsonSchema $schema): array
    {
        return [
            'applications' => $schema->array()
                ->items(
                    $schema->object([
                        'displayName' => $schema->string()
                            ->description('Human-readable name')
                            ->required(),

                        'id' => $schema->string()
                            ->description('Internal GUID uniquely identifying the application for further interaction')
                            ->required(),

                        'description' => $schema->string()
                            ->description('Application description')
                    ])
                )
                ->description('List of applications')
        ];
    }

}
