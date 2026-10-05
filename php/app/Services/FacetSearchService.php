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

class FacetSearchService
{
    /**
     * Encoding flags used when writing the facets file. Values are emitted one at
     * a time (see encodeFacets()), so the complete document string never exists in memory.
     */
    private const JSON_FLAGS = JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT;

    private string $dataPath;

    private string $facetsPath;

    /** @var array<int, string> */
    private array $relationKeys;

    /** @var array<int, string> */
    private array $stringFacetKeys;

    public function __construct()
    {
        $this->dataPath = config('data.path');
        $this->facetsPath = $this->dataPath . DIRECTORY_SEPARATOR . '.meta' . DIRECTORY_SEPARATOR . 'facets.json';
        /** @var array<int, string> $relationKeys */
        $relationKeys = config('facets.relation_keys', [
            'relApplicationToPlatform',
            'relProviderApplicationToInterface',
            'relApplicationToBusinessCapability',
            'relApplicationToUserGroup',
            'relBusinessApplicationToDeploymentApplication',
            'relApplicationToProject',
            'relApplicationToDataObject',
            'relApplicationToDataProduct',
        ]);
        /** @var array<int, string> $stringFacetKeys */
        $stringFacetKeys = config('facets.string_facet_keys', [
            'type',
            'technicalSuitability',
            'businessCriticality',
            'functionalSuitability',
            'lxTimeClassification',
            'lxHostingType',
            'lxProductCategory',
            'sortOrder',
        ]);

        $this->relationKeys = $relationKeys;
        $this->stringFacetKeys = $stringFacetKeys;
    }

    private function resolvePath(?string $dataPath): string
    {
        return $dataPath !== null && $dataPath !== '' ? $dataPath : $this->dataPath;
    }

    private function facetsPathFor(?string $dataPath): string
    {
        $path = $this->resolvePath($dataPath);
        return $path . DIRECTORY_SEPARATOR . '.meta' . DIRECTORY_SEPARATOR . 'facets.json';
    }

    /**
     * Get facets document. Uses cached file if present and _updated is within TTL;
     * otherwise rebuilds and returns fresh data.
     *
     * @return array<string, mixed>
     */
    public function getCached(?string $dataPath = null): array
    {
        $this->ensureFresh($dataPath);
        $cached = $this->readFacetsFile($dataPath);

        return $cached ?? $this->rebuild($dataPath);
    }

    /**
     * Ensure the facets file exists and is within TTL (rebuilding it if not) and
     * return its path. Only the small "_updated" marker is read for the freshness
     * check, so callers can stream the file from disk instead of decoding the whole
     * document into memory.
     */
    public function ensureFresh(?string $dataPath = null): string
    {
        $ttlDays = (float) config('facets.cache_ttl_days', 1);
        $path = $this->facetsPathFor($dataPath);
        $updated = $this->readUpdatedMarker($path);

        if ($updated !== null && $this->isWithinTtl($updated, $ttlDays)) {
            return $path;
        }
        $this->rebuild($dataPath);

        return $path;
    }

    /**
     * Rebuild facets from all entity JSON files in data and write to data/.meta/facets.json.
     *
     * @return array<string, mixed>
     */
    public function rebuild(?string $dataPath = null): array
    {
        $basePath = $this->resolvePath($dataPath);
        $typeSet = [];
        $technicalSuitabilitySet = [];
        $businessCriticalitySet = [];
        $functionalSuitabilitySet = [];
        $lxTimeClassificationSet = [];
        $lxHostingTypeSet = [];
        $lxProductCategorySet = [];
        $relationBuckets = [];
        foreach ($this->relationKeys as $relKey) {
            $relationBuckets[$relKey] = []; // id => factSheet summary
        }
        $tagsById = []; // id => tag object

        // Entity files are stored one level deep by type (e.g. Application/*.json).
        // Also include any JSON files directly at the base path for backwards compatibility.
        $subFiles = glob($basePath . DIRECTORY_SEPARATOR . '*' . DIRECTORY_SEPARATOR . '*.json');
        $rootFiles = glob($basePath . DIRECTORY_SEPARATOR . '*.json');
        $files = array_merge(
            is_array($subFiles) ? $subFiles : [],
            is_array($rootFiles) ? $rootFiles : [],
        );

        $bcRelMap = []; // BusinessCapability id => relToParent structure
        $ugRelMap = []; // UserGroup id => relToParent structure

        foreach ($files as $path) {
            $raw = @file_get_contents($path);
            if ($raw === false) {
                continue;
            }
            $decoded = json_decode($raw, true);
            if (! is_array($decoded)) {
                continue;
            }
            $this->collectStringFacets($decoded, $typeSet, $technicalSuitabilitySet, $businessCriticalitySet, $functionalSuitabilitySet, $lxTimeClassificationSet, $lxHostingTypeSet, $lxProductCategorySet);
            $this->collectRelationFacets($decoded, $relationBuckets);
            $this->collectTags($decoded, $tagsById);

            $entityType = $decoded['type'] ?? null;
            if ($entityType === 'BusinessCapability') {
                $this->ensureEntityInFacetBucket($decoded, 'relApplicationToBusinessCapability', $relationBuckets);
                if (isset($decoded['relToParent']) && is_array($decoded['relToParent'])) {
                    $this->collectBcParentRelationship($decoded, $bcRelMap);
                }
            } elseif ($entityType === 'UserGroup') {
                $this->ensureEntityInFacetBucket($decoded, 'relApplicationToUserGroup', $relationBuckets);
                if (isset($decoded['relToParent']) && is_array($decoded['relToParent'])) {
                    $this->collectBcParentRelationship($decoded, $ugRelMap);
                }
            }
        }

        // Merge hierarchy data into the relation buckets while they are still their
        // sole owner, so BC/UG entries are not duplicated in memory.
        $this->applyRelToParent($relationBuckets, 'relApplicationToBusinessCapability', $bcRelMap);
        $this->applyRelToParent($relationBuckets, 'relApplicationToUserGroup', $ugRelMap);
        unset($bcRelMap, $ugRelMap);

        $facets = [
            '_updated' => now()->toIso8601String(),
            'type' => array_values(array_unique($typeSet)),
            'technicalSuitability' => array_values(array_unique($technicalSuitabilitySet)),
            'businessCriticality' => array_values(array_unique($businessCriticalitySet)),
            'functionalSuitability' => array_values(array_unique($functionalSuitabilitySet)),
            'lxTimeClassification' => array_values(array_unique($lxTimeClassificationSet)),
            'lxHostingType' => array_values(array_unique($lxHostingTypeSet)),
            'lxProductCategory' => array_values(array_unique($lxProductCategorySet)),
        ];
        unset($typeSet, $technicalSuitabilitySet, $businessCriticalitySet, $functionalSuitabilitySet, $lxTimeClassificationSet, $lxHostingTypeSet, $lxProductCategorySet);

        foreach ($this->relationKeys as $relKey) {
            $facets[$relKey] = array_values($relationBuckets[$relKey]);
            unset($relationBuckets[$relKey]);
        }
        $facets['tags'] = array_values($tagsById);
        unset($relationBuckets, $tagsById, $files, $subFiles, $rootFiles);

        $this->writeFacetsFile($facets, $dataPath);

        return $facets;
    }

    /**
     * @param array<string, mixed> $decoded
     * @param array<int, string> $typeSet
     * @param array<int, string> $technicalSuitabilitySet
     * @param array<int, string> $businessCriticalitySet
     * @param array<int, string> $functionalSuitabilitySet
     * @param array<int, string> $lxTimeClassificationSet
     * @param array<int, string> $lxHostingTypeSet
     * @param array<int, string> $lxProductCategorySet
     */
    private function collectStringFacets(
        array $decoded,
        array &$typeSet,
        array &$technicalSuitabilitySet,
        array &$businessCriticalitySet,
        array &$functionalSuitabilitySet,
        array &$lxTimeClassificationSet,
        array &$lxHostingTypeSet,
        array &$lxProductCategorySet
    ): void {
        foreach ($this->stringFacetKeys as $key) {
            $v = $decoded[$key] ?? null;
            if (!is_string($v) || $v === '') {
                continue;
            }
            $s = $v;
            switch ($key) {
                case 'type':
                    $typeSet[$s] = $s;
                    break;
                case 'technicalSuitability':
                    $technicalSuitabilitySet[$s] = $s;
                    break;
                case 'businessCriticality':
                    $businessCriticalitySet[$s] = $s;
                    break;
                case 'functionalSuitability':
                    $functionalSuitabilitySet[$s] = $s;
                    break;
                case 'lxTimeClassification':
                    $lxTimeClassificationSet[$s] = $s;
                    break;
                case 'lxHostingType':
                    $lxHostingTypeSet[$s] = $s;
                    break;
                case 'lxProductCategory':
                    $lxProductCategorySet[$s] = $s;
                    break;
            }
        }
    }

    /**
     * @param array<string, mixed> $decoded
     * @param array<string, array<string, array<string, mixed>>> $relationBuckets
     */
    private function collectRelationFacets(array $decoded, array &$relationBuckets): void
    {
        $directorySourcedKeys = ['relApplicationToUserGroup', 'relApplicationToBusinessCapability'];
        foreach ($this->relationKeys as $relKey) {
            if (in_array($relKey, $directorySourcedKeys, true)) {
                continue;
            }
            $rel = $decoded[$relKey] ?? null;
            if (! is_array($rel)) {
                continue;
            }
            $edges = $rel['edges'] ?? [];
            if (! is_array($edges)) {
                continue;
            }
            foreach ($edges as $edge) {
                $node = is_array($edge) ? ($edge['node'] ?? null) : null;
                if (! is_array($node)) {
                    continue;
                }
                $factSheet = $node['factSheet'] ?? null;
                if (! is_array($factSheet)) {
                    continue;
                }
                $id = $factSheet['id'] ?? null;
                if ($id === null || $id === '') {
                    continue;
                }
                $summary = [
                    'id' => $id,
                    'displayName' => $factSheet['displayName'] ?? '',
                    'fullName' => $factSheet['fullName'] ?? '',
                    'type' => $factSheet['type'] ?? '',
                    'category' => $factSheet['category'] ?? '',
                    'description' => $factSheet['description'] ?? '',
                ];
                $relationBuckets[$relKey][$id] = $summary;
            }
        }
    }

    /**
     * Ensure an entity (BC or UserGroup) is present in its corresponding facet relation bucket,
     * even if not referenced by any Application.
     *
     * @param array<string, mixed> $decoded
     * @param array<string, array<string, array<string, mixed>>> $relationBuckets
     */
    private function ensureEntityInFacetBucket(array $decoded, string $relKey, array &$relationBuckets): void
    {
        $id = $decoded['id'] ?? null;
        if ($id === null || $id === '' || ! isset($relationBuckets[$relKey])) {
            return;
        }
        if (isset($relationBuckets[$relKey][$id])) {
            return;
        }
        $relationBuckets[$relKey][$id] = [
            'id' => $id,
            'displayName' => $decoded['displayName'] ?? '',
            'fullName' => $decoded['fullName'] ?? '',
            'type' => $decoded['type'] ?? '',
            'category' => $decoded['category'] ?? '',
            'description' => $decoded['description'] ?? '',
            'status' => $decoded['status'] ?? '',
        ];
        if (isset($decoded['sortOrder']) && is_numeric($decoded['sortOrder'])) {
            $relationBuckets[$relKey][$id]['sortOrder'] = $decoded['sortOrder'] + 0;
        }
    }

    /**
     * Collect the relToParent structure from a BusinessCapability or UserGroup entity.
     *
     * @param array<string, mixed> $decoded
     * @param array<string, array<string, mixed>> $relMap  entity id => relToParent structure
     */
    private function collectBcParentRelationship(array $decoded, array &$relMap): void
    {
        $id = $decoded['id'] ?? null;
        if ($id === null || $id === '') {
            return;
        }
        $relToParent = $decoded['relToParent'];
        if (! is_array($relToParent)) {
            return;
        }
        $edges = $relToParent['edges'] ?? [];
        if (! is_array($edges) || $edges === []) {
            return;
        }
        $relMap[(string) $id] = $relToParent;
    }

    /**
     * Attach the collected relToParent structures to the corresponding facet bucket entries.
     * Must be called while the buckets are still their sole owner so entries are updated
     * in place instead of being copied.
     *
     * @param array<string, array<string, array<string, mixed>>> $relationBuckets
     * @param array<string, array<string, mixed>> $relMap  entity id => relToParent structure
     */
    private function applyRelToParent(array &$relationBuckets, string $relKey, array $relMap): void
    {
        if ($relMap === [] || ! isset($relationBuckets[$relKey])) {
            return;
        }
        foreach ($relMap as $id => $relToParent) {
            if (isset($relationBuckets[$relKey][$id])) {
                $relationBuckets[$relKey][$id]['relToParent'] = $relToParent;
            }
        }
    }

    /**
     * @param array<string, mixed> $decoded
     * @param array<string, array<string, mixed>> $tagsById
     */
    private function collectTags(array $decoded, array &$tagsById): void
    {
        $this->collectTagsFromList($decoded['tags'] ?? [], $tagsById);
        foreach ($this->relationKeys as $relKey) {
            $rel = $decoded[$relKey] ?? null;
            if (! is_array($rel)) {
                continue;
            }
            $edges = $rel['edges'] ?? [];
            if (! is_array($edges)) {
                continue;
            }
            foreach ($edges as $edge) {
                $node = is_array($edge) ? ($edge['node'] ?? null) : null;
                if (! is_array($node)) {
                    continue;
                }
                $factSheet = $node['factSheet'] ?? null;
                if (is_array($factSheet)) {
                    $this->collectTagsFromList($factSheet['tags'] ?? [], $tagsById);
                }
            }
        }
    }

    /**
     * @param array<int, mixed> $tagList
     * @param array<string, array<string, mixed>> $tagsById
     */
    private function collectTagsFromList(array $tagList, array &$tagsById): void
    {
        foreach ($tagList as $tag) {
            if (! is_array($tag)) {
                continue;
            }
            $id = $tag['id'] ?? null;
            if ($id === null || $id === '') {
                continue;
            }
            $tagGroup = $tag['tagGroup'] ?? null;
            $tagGroupId = null;
            $tagGroupName = null;
            $tagGroupShortName = null;
            $tagGroupMode = null;
            $tagGroupMandatory = null;
            if (is_array($tagGroup)) {
                $tagGroupId = $tagGroup['id'] ?? null;
                $tagGroupName = $tagGroup['name'] ?? null;
                $tagGroupShortName = $tagGroup['shortName'] ?? null;
                $tagGroupMode = $tagGroup['mode'] ?? null;
                $tagGroupMandatory = $tagGroup['mandatory'] ?? null;
            }
            $tagsById[$id] = [
                'id' => $id,
                'name' => $tag['name'] ?? '',
                'color' => $tag['color'] ?? '',
                'description' => $tag['description'] ?? '',
                'tagGroupId' => $tagGroupId,
                'tagGroupName' => $tagGroupName,
                'tagGroupShortName' => $tagGroupShortName,
                'tagGroupMode' => $tagGroupMode,
                'tagGroupMandatory' => $tagGroupMandatory,
            ];
        }
    }

    private function readFacetsFile(?string $dataPath = null): ?array
    {
        $path = $this->facetsPathFor($dataPath);
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
     * Read only the "_updated" marker from the head of the facets file, avoiding a
     * full json_decode of the (potentially very large) document. The marker is always
     * written as the first key of the document.
     */
    private function readUpdatedMarker(string $path): ?string
    {
        if (! is_file($path)) {
            return null;
        }
        $handle = @fopen($path, 'rb');
        if ($handle === false) {
            return null;
        }
        try {
            $head = @fread($handle, 8192);
        } finally {
            fclose($handle);
        }
        if (! is_string($head) || preg_match('/"_updated"\s*:\s*"([^"]*)"/', $head, $matches) !== 1) {
            return null;
        }

        return $matches[1];
    }

    /**
     * Invalidate the cached facets file for the given data path (or default path).
     */
    public function invalidate(?string $dataPath = null): void
    {
        $path = $this->facetsPathFor($dataPath);
        if (is_file($path)) {
            @unlink($path);
        }
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
     * Write the facets document to disk, encoding it chunk by chunk.
     * Streaming the output keeps peak memory constant: json_encode() of the complete
     * document used to exhaust the PHP memory limit on large data sets.
     *
     * The document is encoded into a temporary file first and only then moved into
     * place, so a failure while encoding never leaves a truncated facets document.
     *
     * @param array<string, mixed> $facets
     */
    private function writeFacetsFile(array $facets, ?string $dataPath = null): void
    {
        $path = $this->facetsPathFor($dataPath);
        $metaDir = dirname($path);
        if (! File::isDirectory($metaDir)) {
            File::makeDirectory($metaDir, 0755, true);
        }

        $tempPath = $path . '.tmp.' . getmypid() . '.' . bin2hex(random_bytes(4));

        try {
            $this->encodeToFile($facets, $tempPath);

            if (! @rename($tempPath, $path)) {
                // Windows can refuse to replace a file that is open elsewhere, so fall
                // back to copying the finished document into place.
                $this->copyIntoFile($tempPath, $path);
                @unlink($tempPath);
            }
        } catch (\Throwable $e) {
            @unlink($tempPath);

            throw $e;
        }
    }

    /**
     * Encode the facets document into the given file, flushing buffered chunks.
     *
     * @param array<string, mixed> $facets
     */
    private function encodeToFile(array $facets, string $path): void
    {
        $handle = @fopen($path, 'wb');
        if ($handle === false) {
            throw new \RuntimeException('Failed to open facets file for writing.');
        }
        try {
            $buffer = '';
            foreach ($this->encodeFacets($facets) as $chunk) {
                $buffer .= $chunk;
                if (strlen($buffer) >= 65536) {
                    $this->flushFacetsChunk($handle, $buffer);
                }
            }
            if ($buffer !== '') {
                $this->flushFacetsChunk($handle, $buffer);
            }
        } finally {
            fclose($handle);
        }
    }

    /**
     * Copy a finished file into place, replacing the target under an exclusive lock.
     */
    private function copyIntoFile(string $from, string $to): void
    {
        $source = @fopen($from, 'rb');
        if ($source === false) {
            throw new \RuntimeException('Failed to read temporary facets file.');
        }
        try {
            $target = @fopen($to, 'c+b');
            if ($target === false) {
                throw new \RuntimeException('Failed to open facets file for writing.');
            }
            if (! flock($target, LOCK_EX)) {
                fclose($target);
                throw new \RuntimeException('Failed to lock facets file.');
            }
            try {
                if (! ftruncate($target, 0)) {
                    throw new \RuntimeException('Failed to truncate facets file.');
                }
                while (! feof($source)) {
                    $chunk = fread($source, 65536);
                    if ($chunk === false) {
                        break;
                    }
                    $this->flushFacetsChunk($target, $chunk);
                }
            } finally {
                flock($target, LOCK_UN);
                fclose($target);
            }
        } finally {
            fclose($source);
        }
    }

    /**
     * Encode the facets document into small JSON chunks (one key or value at a time),
     * producing the same output as json_encode($facets, self::JSON_FLAGS) without ever
     * holding the whole document string in memory.
     *
     * @param array<string, mixed> $facets
     * @return \Generator<int, string>
     */
    private function encodeFacets(array $facets): \Generator
    {
        yield '{';
        $separator = "\n";
        foreach ($facets as $key => $value) {
            yield $separator . '    ' . $this->encodeJsonScalar((string) $key) . ': ';
            yield from $this->encodeJsonValue($value, '    ');
            $separator = ',';
        }
        yield "\n}";
    }

    /**
     * Encode a single JSON value (scalar, list or object) into chunks.
     *
     * @return \Generator<int, string>
     */
    private function encodeJsonValue(mixed $value, string $indent): \Generator
    {
        if (! is_array($value)) {
            yield $this->encodeJsonScalar($value);

            return;
        }

        if ($value === []) {
            yield '[]';

            return;
        }

        $childIndent = $indent . '    ';

        if (array_is_list($value)) {
            yield '[';
            $separator = "\n";
            foreach ($value as $item) {
                yield $separator . $childIndent;
                yield from $this->encodeJsonValue($item, $childIndent);
                $separator = ',';
            }
            yield "\n" . $indent . ']';

            return;
        }

        yield '{';
        $separator = "\n";
        foreach ($value as $key => $item) {
            yield $separator . $childIndent . $this->encodeJsonScalar((string) $key) . ': ';
            yield from $this->encodeJsonValue($item, $childIndent);
            $separator = ',';
        }
        yield "\n" . $indent . '}';
    }

    private function encodeJsonScalar(mixed $value): string
    {
        return json_encode($value, self::JSON_FLAGS);
    }

    /**
     * @param resource $handle
     */
    private function flushFacetsChunk($handle, string &$buffer): void
    {
        $total = strlen($buffer);
        $written = 0;
        while ($written < $total) {
            $result = fwrite($handle, substr($buffer, $written));
            if ($result === false || $result === 0) {
                throw new \RuntimeException('Failed to write facets file.');
            }
            $written += $result;
        }
        $buffer = '';
    }
}
