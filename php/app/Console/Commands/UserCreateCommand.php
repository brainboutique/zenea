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

namespace App\Console\Commands;

use App\Services\AuthorizationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

class UserCreateCommand extends Command
{
    protected $signature = 'auth:user-create
                            {username : The username (email) for the user}
                            {--password= : The password (will prompt if not provided)}
                            {--admin : Grant admin privileges}
                            {--auto-discover-repos : Automatically add all existing repositories with default role}';

    protected $description = 'Create or update a user in the htpasswd file and grant access in .auth.json';

    public function handle(AuthorizationService $authorizationService): int
    {
        $username = $this->argument('username');
        $password = $this->option('password');

        if (! is_string($username) || $username === '') {
            $this->error('Username is required');
            return self::FAILURE;
        }

        if ($password === null) {
            $password = $this->secret('Enter password');
            if ($password === null || $password === '') {
                $this->error('Password is required');
                return self::FAILURE;
            }
        }

        $isAdmin = $this->option('admin');
        $autoDiscover = $this->option('auto-discover-repos');

        $htpasswdPath = $this->getHtpasswdPath();
        $authJsonPath = $this->getAuthJsonPath();

        $this->updateHtpasswd($htpasswdPath, $username, $password);

        $repositories = [];
        if ($autoDiscover) {
            $allRepos = $authorizationService->discoverExistingRepos();
            $defaultRole = $this->getDefaultRole();
            foreach ($allRepos as $repoBranch) {
                $repositories[$repoBranch] = $defaultRole !== null ? [$defaultRole] : [];
            }
            $this->info('Discovered repositories: ' . implode(', ', $allRepos));
        }

        $this->updateAuthJson($authJsonPath, $username, $isAdmin, $repositories);

        $this->info("User '$username' created/updated successfully.");
        $this->info("  - htpasswd: $htpasswdPath");
        $this->info("  - auth.json: $authJsonPath");
        $this->info("  - Admin: " . ($isAdmin ? 'yes' : 'no'));
        if (! empty($repositories)) {
            $this->info('  - Access to ' . count($repositories) . ' repository/branch(es)');
        }

        return self::SUCCESS;
    }

    private function getHtpasswdPath(): string
    {
        $path = config('auth.htpasswd_file', '');
        if ($path === '') {
            $dataPath = rtrim((string) config('data.path', base_path('../data')), \DIRECTORY_SEPARATOR);
            $path = $dataPath . \DIRECTORY_SEPARATOR . '.htpasswd';
        }

        $dir = dirname($path);
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        return $path;
    }

    private function getAuthJsonPath(): string
    {
        $dataPath = rtrim((string) config('data.path', base_path('../data')), \DIRECTORY_SEPARATOR);

        return $dataPath . \DIRECTORY_SEPARATOR . '.auth.json';
    }

    private function updateHtpasswd(string $path, string $username, string $password): void
    {
        $users = [];

        if (is_file($path)) {
            $handle = fopen($path, 'r');
            if ($handle) {
                while (($line = fgets($handle)) !== false) {
                    $line = rtrim($line, "\r\n");
                    $parts = explode(':', $line, 2);
                    if (count($parts) === 2) {
                        $users[strtolower($parts[0])] = $line;
                    }
                }
                fclose($handle);
            }
        }

        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
        $users[strtolower($username)] = "$username:$hash";

        $handle = fopen($path, 'w');
        if ($handle) {
            foreach ($users as $userLine) {
                fwrite($handle, $userLine . "\n");
            }
            fclose($handle);
        } else {
            $this->error("Could not write to $path");
        }
    }

    private function updateAuthJson(string $path, string $username, bool $isAdmin, array $repositories = []): void
    {
        $data = [];

        if (is_file($path)) {
            $json = file_get_contents($path);
            if ($json !== false) {
                $decoded = json_decode($json, true);
                if (is_array($decoded)) {
                    $data = $decoded;
                }
            }
        }

        $usernameLower = strtolower($username);
        $entry = [
            'access' => true,
        ];

        if ($isAdmin) {
            $entry['isAdmin'] = true;
        }

        if (! empty($repositories)) {
            $entry['repositories'] = $repositories;
        }

        $data[$usernameLower] = $entry;

        $dir = dirname($path);
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        if (file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) === false) {
            $this->error("Could not write to $path");
        }
    }

    private function getDefaultRole(): ?string
    {
        $dataPath = rtrim((string) config('data.path', base_path('../data')), \DIRECTORY_SEPARATOR);
        $path = $dataPath . \DIRECTORY_SEPARATOR . '.roles.json';

        if (! is_file($path)) {
            return null;
        }

        $json = @file_get_contents($path);
        if ($json === false) {
            return null;
        }

        $data = json_decode($json, true);
        if (! is_array($data) || empty($data)) {
            return null;
        }

        return array_key_first($data);
    }
}
