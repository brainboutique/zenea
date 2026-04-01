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

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->ensureLocalAuthSetup();
    }

    private function ensureLocalAuthSetup(): void
    {
        if (config('auth.mode') !== 'Local') {
            return;
        }

        $dataPath = rtrim(config('data.path', base_path('../data')), DIRECTORY_SEPARATOR);
        $htpasswdPath = $dataPath . DIRECTORY_SEPARATOR . '.htpasswd';
        $authJsonPath = $dataPath . DIRECTORY_SEPARATOR . '.auth.json';

        if (! is_file($htpasswdPath)) {
            $password = bin2hex(random_bytes(12));
            $hash = password_hash($password, PASSWORD_BCRYPT);

            file_put_contents($htpasswdPath, "admin:{$hash}\n");
            chmod($htpasswdPath, 0600);

            $logMessage = sprintf(
                "#################################################################\nPlease record your admin credentials. Information is not displayed again!\nUser name: admin\nPassword: %s\n################################################################\n",
                $password
            );
            error_log($logMessage);

            $authData = [];
            if (is_file($authJsonPath)) {
                $existing = json_decode(file_get_contents($authJsonPath), true);
                if (is_array($existing)) {
                    $authData = $existing;
                }
            }
            $authData['admin'] = [
                'role' => 'admin',
                'access' => true,
            ];
            file_put_contents($authJsonPath, json_encode($authData, JSON_PRETTY_PRINT));
            chmod($authJsonPath, 0600);
        }
    }
}
