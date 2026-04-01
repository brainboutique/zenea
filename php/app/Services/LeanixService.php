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

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class LeanixService
{
    private const REQUEST_TIMEOUT = 60;
    private const RETRY_MAX = 1;
    private const RETRY_BACKOFF = 2.0;
    private const RELATION_PAGE_SIZE = 200;

    private const SUPPORTED_FACT_SHEET_TYPES = [
        'Application',
        'UserGroup',
        'BusinessCapability',
        'Platform',
        'ITComponent',
    ];

    private const ALL_FACTSHEETS_QUERY = <<<'GRAPHQL'
query AllFactSheets($first: Int!, $after: String) {
  allFactSheets(factSheetType: Application, first: $first, after: $after) {
    totalCount
    pageInfo { hasNextPage endCursor }
    edges { node { id displayName } }
  }
}
GRAPHQL;

    /**
     * @throws \InvalidArgumentException
     */
    private function assertSupportedFactSheetType(string $factSheetType): string
    {
        $t = trim($factSheetType);
        if (! in_array($t, self::SUPPORTED_FACT_SHEET_TYPES, true)) {
            throw new \InvalidArgumentException('Unsupported LeanIX fact sheet type.');
        }
        return $t;
    }

    private function buildAllFactSheetsQuery(string $factSheetType): string
    {
        $factSheetType = $this->assertSupportedFactSheetType($factSheetType);

        // LeanIX uses an enum-like value for factSheetType (no quotes).
        return
            'query AllFactSheets($first: Int!, $after: String) {' .
            '  allFactSheets(factSheetType: ' . $factSheetType . ', first: $first, after: $after) {' .
            '    totalCount' .
            '    pageInfo { hasNextPage endCursor }' .
            '    edges { node { id displayName } }' .
            '  }' .
            '}';
    }

    /**
     * Fetch all Application fact sheet IDs and display names from LeanIX.
     *
     * @return array<int, array{id: string, displayName: string}>
     */
    public function fetchAllApplicationIds(string $baseUrl, string $bearerToken, string $cookies): array
    {
        return $this->fetchAllFactSheetIds($baseUrl, $bearerToken, $cookies, 'Application');
    }

    /**
     * Fetch all fact sheet IDs and display names from LeanIX for the given type.
     *
     * @return array<int, array{id: string, displayName: string}>
     */
    public function fetchAllFactSheetIds(string $baseUrl, string $bearerToken, string $cookies, string $factSheetType): array
    {
        $factSheetType = $this->assertSupportedFactSheetType($factSheetType);

        $url = rtrim($baseUrl, '/') . '/services/pathfinder/v1/graphql';
        $headers = $this->buildHeaders($bearerToken, $cookies);

        $out = [];
        $after = null;
        $pageSize = 100;
        $query = $this->buildAllFactSheetsQuery($factSheetType);

        while (true) {
            $variables = [
                'first' => $pageSize,
                'after' => $after,
            ];
            $response = $this->graphqlPost($url, $headers, $query, $variables);

            $obj = $response['data']['allFactSheets'] ?? null;
            if (!is_array($obj)) {
                break;
            }
            foreach ($obj['edges'] ?? [] as $edge) {
                $node = $edge['node'] ?? [];
                $out[] = [
                    'id' => (string) ($node['id'] ?? ''),
                    'displayName' => (string) ($node['displayName'] ?? ''),
                ];
            }
            $pageInfo = $obj['pageInfo'] ?? null;
            if (!is_array($pageInfo) || !($pageInfo['hasNextPage'] ?? false) || empty($pageInfo['endCursor'])) {
                break;
            }
            $after = $pageInfo['endCursor'];
        }
        return $out;
    }

    /**
     * Fetch the full Application fact sheet (including relations) for a given ID.
     *
     * @return array<string, mixed>|null
     */
    public function fetchApplicationFactSheet(string $baseUrl, string $bearerToken, string $cookies, string $id): ?array
    {
        $url = rtrim($baseUrl, '/') . '/services/pathfinder/v1/graphql';
        $headers = $this->buildHeaders($bearerToken, $cookies);

        $query = $this->buildApplicationQuery();
        $variables = [
            'id' => $id,
            'relationFirst' => self::RELATION_PAGE_SIZE,
        ];

        $response = $this->graphqlPost($url, $headers, $query, $variables);
        $factSheet = $response['data']['factSheet']['Application'] ?? null;
        if ($factSheet === null) {
            // Some GraphQL responses may use ... on Application without nesting under \"Application\";
            // fall back to returning the raw factSheet.
            $factSheet = $response['data']['factSheet'] ?? null;
        }

        return is_array($factSheet) ? $factSheet : null;
    }

    /**
     * Fetch the full fact sheet for the given type.
     * For Application we fetch the full relations payload; for other types we fetch a smaller
     * scalar+tags payload to keep the GraphQL query schema-safe.
     */
    public function fetchFactSheet(
        string $baseUrl,
        string $bearerToken,
        string $cookies,
        string $factSheetType,
        string $id
    ): ?array {
        $factSheetType = $this->assertSupportedFactSheetType($factSheetType);
        if ($factSheetType === 'Application') {
            return $this->fetchApplicationFactSheet($baseUrl, $bearerToken, $cookies, $id);
        }

        $url = rtrim($baseUrl, '/') . '/services/pathfinder/v1/graphql';
        $headers = $this->buildHeaders($bearerToken, $cookies);

        $query = $this->buildFactSheetQueryForType($factSheetType);
        $variables = [
            'id' => $id,
        ];

        $response = $this->graphqlPost($url, $headers, $query, $variables);
        $factSheet = $response['data']['factSheet'][$factSheetType] ?? null;
        if ($factSheet === null) {
            // Some GraphQL responses may use ... on TYPE without nesting under \"TYPE\".
            $factSheet = $response['data']['factSheet'] ?? null;
        }

        return is_array($factSheet) ? $factSheet : null;
    }

    private function buildFactSheetQueryForType(string $factSheetType): string
    {
        $factSheetType = $this->assertSupportedFactSheetType($factSheetType);
        $lifecycleAlias = $factSheetType . 'Lifecycle';

        return
            'query FactSheetByType($id: ID!) {' .
            '  factSheet: factSheet(id: $id, options: {includeReferenceFactSheetRelations: true}) {' .
            '    ... on ' . $factSheetType . ' {' .
            '      rev type displayName name description category ' .
            '      completion{percentage sectionCompletions{name percentage}} ' .
            '      id fullName status level createdAt updatedAt ' .
            '      lxState qualitySeal ' .
            '      ' . $lifecycleAlias . ': lifecycle{asString phases{phase startDate}} ' .
            '      tags{id name description color tagGroup{id shortName mode name mandatory}}' .
            '    }' .
            '  }' .
            '}';
    }

    /**
     * @param array<string, string> $headers
     * @param array<string, mixed>  $variables
     * @return array<string, mixed>
     */
    private function graphqlPost(string $url, array $headers, string $query, array $variables): array
    {
        $payload = [
            'query' => $query,
            'variables' => $variables,
        ];

        $attempt = 0;
        $lastException = null;

        while ($attempt < self::RETRY_MAX) {
            $attempt++;
            try {
                $response = Http::withHeaders($headers)
                    ->timeout(self::REQUEST_TIMEOUT)
                    ->post($url, $payload);
                if ($response->status() === 401) {
                    throw new \RuntimeException('Unauthorized (401) from LeanIX. Check Bearer token and cookies.');
                }

                if ($response->status() === 429 || $response->status() >= 500) {
                    $this->sleepBackoff($attempt);
                    continue;
                }
                $response->throw();
                $json = $response->json();
                if (!is_array($json)) {
                    throw new \RuntimeException('Invalid JSON response from LeanIX.');
                }

                if (!empty($json['errors'])) {
                    $messages = array_map(
                        static fn ($e) => is_array($e) && isset($e['message']) ? (string) $e['message'] : json_encode($e),
                        (array) $json['errors']
                    );
                    error_log("ERROR fetching LeanIX data: ".json_encode($messages));
                    throw new \RuntimeException('LeanIX GraphQL error(s): ' . implode('; ', $messages));
                }

                return $json;
            } catch (\Throwable $e) {
                $lastException = $e;
                $this->sleepBackoff($attempt);
            }
        }

        Log::warning("Error running LeanIX query ".$lastException->getMessage());

        throw new \RuntimeException('Max retries reached when talking to LeanIX.', 0, $lastException);
    }

    /**
     * @return array<string, string>
     */
    private function buildHeaders(string $bearerToken, string $cookies): array
    {
        return [
            'Authorization' => $bearerToken,
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
            'Cookie' => $cookies,
        ];
    }

    private function sleepBackoff(int $attempt): void
    {
        $seconds = self::RETRY_BACKOFF ** $attempt;
        usleep((int) ($seconds * 1_000_000));
    }

    public function fetchFactSheetsParallel(
        string $baseUrl,
        string $bearerToken,
        string $cookies,
        array $requests,
        int $maxConcurrency = 10
    ): array {
        $url = rtrim($baseUrl, '/') . '/services/pathfinder/v1/graphql';
        $headers = $this->buildHeaders($bearerToken, $cookies);
        $headerLines = [];
        foreach ($headers as $name => $value) {
            $headerLines[] = "$name: $value";
        }

        $results = [];
        $handles = [];
        $idToKey = [];

        $mh = curl_multi_init();

        foreach ($requests as $index => $request) {
            $id = $request['id'];
            $type = $request['type'];
            $factSheetType = $this->assertSupportedFactSheetType($type);
            $query = $factSheetType === 'Application'
                ? $this->buildApplicationQuery()
                : $this->buildFactSheetQueryForType($factSheetType);

            $payload = json_encode(['query' => $query, 'variables' => ['id' => $id, 'relationFirst' => self::RELATION_PAGE_SIZE]]);

            $ch = curl_init();
            curl_setopt_array($ch, [
                CURLOPT_URL => $url,
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $payload,
                CURLOPT_HTTPHEADER => $headerLines,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => self::REQUEST_TIMEOUT,
                CURLOPT_WRITEFUNCTION => static function ($ch, $data) use (&$results, $index) {
                    $results[$index]['body'] = ($results[$index]['body'] ?? '') . $data;
                    return strlen($data);
                },
            ]);

            curl_multi_add_handle($mh, $ch);
            $handles[$index] = $ch;
            $idToKey[$index] = $id;
        }

        $running = null;
        do {
            $status = curl_multi_exec($mh, $running);
            if ($running > 0) {
                curl_multi_select($mh, 0.1);
            }
        } while ($running > 0 && $status === CURLM_OK);

        foreach ($handles as $index => $ch) {
            $results[$index]['httpCode'] = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);
        }
        curl_multi_close($mh);

        $output = [];
        foreach ($results as $index => $result) {
            $id = $idToKey[$index];
            $type = $requests[$index]['type'];

            if ($result['httpCode'] !== 200 || empty($result['body'])) {
                $output[$id] = null;
                continue;
            }

            $json = json_decode($result['body'], true);
            if (!is_array($json)) {
                $output[$id] = null;
                continue;
            }

            $factSheet = $json['data']['factSheet'][$type]
                ?? $json['data']['factSheet'][$type]
                ?? $json['data']['factSheet']
                ?? null;

            $output[$id] = is_array($factSheet) ? $factSheet : null;
        }

        return $output;
    }

    private function buildApplicationQuery(): string
    {
        // This mirrors the Python FACT_SHEET_APPLICATION_QUERY (trimmed to server-side usage).
        $relFactSheet =
            'factSheet{id displayName fullName type qualitySeal lxState category description ' .
            /*'permissions{self create read update delete}' .
            'subscriptions{edges{node{id type user{id displayName technicalUser email}}}}' .
            '...on Platform{PlatformLifecycle:lifecycle{asString phases{phase startDate}}}' .
            '...on Application{ApplicationLifecycle:lifecycle{asString phases{phase startDate}} lxHostingType}' .
            '...on Interface{InterfaceLifecycle:lifecycle{asString phases{phase startDate}}}' .
            '...on BusinessCapability{BusinessCapabilityLifecycle:lifecycle{asString phases{phase startDate}}}' .
            '...on UserGroup{UserGroupLifecycle:lifecycle{asString phases{phase startDate}}}' .
            '...on Project{ProjectLifecycle:lifecycle{asString phases{phase startDate}}}' .
            '...on DataObject{DataObjectLifecycle:lifecycle{asString phases{phase startDate}}}' .
            '...on ITComponent{ITComponentLifecycle:lifecycle{asString phases{phase startDate}}}' .
            '...on Process{ProcessLifecycle:lifecycle{asString phases{phase startDate}}}' .
            '...on Provider{ProviderLifecycle:lifecycle{asString phases{phase startDate}}}' .
            '...on TechnicalStack{TechnicalStackLifecycle:lifecycle{asString phases{phase startDate}}}' .
            '...on Objective{ObjectiveObjectiveLifecycle:objectiveLifecycle{asString phases{phase startDate}}}' .*/
            'tags{id name description color tagGroup{id shortName name}}}';

        $relBlock =
            //'permissions{self create read update delete}' .
            'edges{node{id activeFrom activeUntil permissions{self create read update delete}' .
            $relFactSheet .
            '}}' .
            //'pageInfo{startCursor endCursor hasNextPage hasPreviousPage}'.
            'totalCount';

        $relationConfigs = [
            ['relApplicationToPlatform', null],
            ['relToChild', null],
            ['relProviderApplicationToInterface', null],
            ['relDeploymentApplicationToBusinessApplication', null],
            ['relToParent', null],
            ['relApplicationToBusinessCapability', null],
            ['relBusinessApplicationToDeploymentApplication', null],
            ['relApplicationToUserGroup', null],
            ['relApplicationToProject', null],
            ['relToPredecessor', null],
            ['relToSuccessor', null],
            ['relApplicationToDataObject', null],
            ['relApplicationToITComponent', ['__missing__']],
            ['relApplicationToITComponent_software:relApplicationToITComponent', ['software']],
            ['relApplicationToITComponent_hardware:relApplicationToITComponent', ['hardware']],
            ['relApplicationToITComponent_service:relApplicationToITComponent', ['service']],
            ['relApplicationToITComponent_iaas:relApplicationToITComponent', ['iaas']],
            ['relApplicationToITComponent_paas:relApplicationToITComponent', ['paas']],
            ['relApplicationToITComponent_saas:relApplicationToITComponent', ['saas']],
            ['relApplicationToITComponent_llm:relApplicationToITComponent', ['llm']],
            ['relToRequires', null],
            ['relConsumerApplicationToInterface', null],
            ['relApplicationToProcess', null],
            ['relMicroserviceApplicationToBusinessApplication', null],
            ['relToRequiredBy', null],
            ['relBusinessApplicationToMicroserviceApplication', null],
        ];

        $relationSelection = '';
        foreach ($relationConfigs as [$name, $keys]) {
            if ($keys === null) {
                $relationSelection .= sprintf('%s(first: $relationFirst){%s}', $name, $relBlock);
            } else {
                $keysJson = json_encode($keys, JSON_THROW_ON_ERROR);
                $relationSelection .= sprintf(
                    '%s(first: $relationFirst facetFilters:[{facetKey:"category",keys:%s}]){%s}',
                    $name,
                    $keysJson,
                    $relBlock
                );
            }
        }

        return
            'query FactSheetApplication($id: ID!, $relationFirst: Int) {' .
            '  factSheet(id: $id) {' .
            '    ... on Application {' .
            '      rev type naFields '. //permissions{self create read update delete} '.
            '      displayName name description category ' .
            '      completion{percentage sectionCompletions{name percentage}} ' .
            '      id fullName type ' .
            '      tags{id name color description tagGroup{id shortName mode name mandatory}} ' .
            '      subscriptions{edges{node{id user{id firstName lastName displayName email technicalUser permission{role status}}type roles{id name description comment subscriptionType restrictToFactSheetTypes}createdAt}}} ' .
            '      status level createdAt updatedAt lxState qualitySeal ' .
            '      ApplicationLifecycle:lifecycle{asString phases{phase startDate milestoneId}} ' .
            '      functionalSuitabilityDescription technicalSuitabilityDescription functionalSuitability technicalSuitability ' .
            '      businessCriticality aggregatedObsolescenceRisk release businessCriticalityDescription alias orderingState ' .
            '      lxCatalogStatus lxProductCategory lxHostingType lxHostingDescription lxSsoProvider lxStatusSSO ' .
            '      lxAiUsage lxAiRisk lxAiType lxAiTaxonomyDescription lxAiPotential ' .
            '      lxTimeClassification lxTimeClassificationDescription lxSixRClassification lxSixRRiskClassification lxSixRTimePriority lxSixRClassificationDescription ' .
            '      externalId{externalId comment externalUrl status} signavioGlossaryItemId{externalId comment externalUrl status} ' .
            '      lxSiId{externalId comment externalUrl status} lxCatalogId{externalId comment externalUrl status} ' .
            $relationSelection .
            '    }' .
            '  }' .
            '}';
    }
}

