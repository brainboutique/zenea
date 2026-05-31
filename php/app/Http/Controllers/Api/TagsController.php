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

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DataPathResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\File;

class TagsController extends Controller
{
    public function __construct(
        private DataPathResolver $dataPathResolver
    ) {
    }

    private function resolvePath(?string $repoName, ?string $branch): string
    {
        try {
            return $this->dataPathResolver->resolve($repoName, $branch, null);
        } catch (\InvalidArgumentException $e) {
            abort(400, $e->getMessage());
        }
    }

    /**
     * @OA\Get(
     *     path="/api/v1/{repoName}/{branch}/tags",
     *     operationId="getTagsRepoBranch",
     *     tags={"Tags"},
     *     summary="Get tags hierarchy (TagGroups with their Tags)",
     *     description="Returns all TagGroups with their associated Tags from /data/{repoName}/{branch}. Use repoName=local, branch=default for default data.",
     *     @OA\Parameter(name="repoName", in="path", required=true, description="Repository name", @OA\Schema(type="string")),
     *     @OA\Parameter(name="branch", in="path", required=true, description="Branch name", @OA\Schema(type="string")),
     *     @OA\Response(response="200", description="Tags hierarchy", @OA\JsonContent(
     *         type="array",
     *         @OA\Items(
     *             type="object",
     *             @OA\Property(property="id", type="string"),
     *             @OA\Property(property="displayName", type="string"),
     *             @OA\Property(property="name", type="string"),
     *             @OA\Property(property="shortName", type="string"),
     *             @OA\Property(property="description", type="string", nullable=true),
     *             @OA\Property(property="mode", type="string", nullable=true),
     *             @OA\Property(property="mandatory", type="boolean", nullable=true),
     *             @OA\Property(property="tags", type="array", @OA\Items(
     *                 type="object",
     *                 @OA\Property(property="id", type="string"),
     *                 @OA\Property(property="displayName", type="string"),
     *                 @OA\Property(property="name", type="string"),
     *                 @OA\Property(property="color", type="string", nullable=true),
     *                 @OA\Property(property="description", type="string", nullable=true)
     *             ))
     *         )
     *     )),
     * )
     */
    public function getTags(string $repoName, string $branch): JsonResponse
    {
        $basePath = $this->resolvePath($repoName, $branch);

        $tagGroupDir = $basePath . DIRECTORY_SEPARATOR . 'TagGroup';
        $tagDir = $basePath . DIRECTORY_SEPARATOR . 'Tag';

        $tagGroups = [];
        if (is_dir($tagGroupDir)) {
            foreach (File::files($tagGroupDir) as $file) {
                if ($file->getExtension() !== 'json') continue;
                $raw = @file_get_contents($file->getPathname());
                if ($raw === false) continue;
                $data = json_decode($raw, true);
                if (!is_array($data)) continue;

                $tagGroups[] = [
                    'id' => $data['id'] ?? $file->getBasename('.json'),
                    'displayName' => $data['name'] ?? $data['shortName'] ?? $file->getBasename('.json'),
                    'name' => $data['name'] ?? '',
                    'shortName' => $data['shortName'] ?? '',
                    'description' => $data['description'] ?? null,
                    'mode' => $data['mode'] ?? null,
                    'mandatory' => $data['mandatory'] ?? null,
                    'tags' => [],
                ];
            }
        }

        $tagsByGroupId = [];
        if (is_dir($tagDir)) {
            foreach (File::files($tagDir) as $file) {
                if ($file->getExtension() !== 'json') continue;
                $raw = @file_get_contents($file->getPathname());
                if ($raw === false) continue;
                $data = json_decode($raw, true);
                if (!is_array($data)) continue;

                $groupId = null;
                if (isset($data['tagGroup']) && is_array($data['tagGroup'])) {
                    $groupId = $data['tagGroup']['id'] ?? null;
                }

                $tag = [
                    'id' => $data['id'] ?? $file->getBasename('.json'),
                    'displayName' => $data['name'] ?? $file->getBasename('.json'),
                    'name' => $data['name'] ?? '',
                    'color' => $data['color'] ?? null,
                    'description' => $data['description'] ?? null,
                ];

                if ($groupId !== null) {
                    if (!isset($tagsByGroupId[$groupId])) {
                        $tagsByGroupId[$groupId] = [];
                    }
                    $tagsByGroupId[$groupId][] = $tag;
                }
            }
        }

        foreach ($tagGroups as &$group) {
            $groupId = $group['id'];
            if (isset($tagsByGroupId[$groupId])) {
                $group['tags'] = $tagsByGroupId[$groupId];
            }
        }
        unset($group);

        $ungroupedTags = $tagsByGroupId[null] ?? [];
        if (!empty($ungroupedTags)) {
            array_unshift($tagGroups, [
                'id' => null,
                'displayName' => 'Ungrouped',
                'name' => 'Ungrouped',
                'shortName' => '',
                'description' => null,
                'mode' => null,
                'mandatory' => null,
                'tags' => $ungroupedTags,
            ]);
        }

        $tagGroups = array_values(array_filter($tagGroups, fn($g) => !empty($g['tags'])));

        return response()->json($tagGroups);
    }
}
