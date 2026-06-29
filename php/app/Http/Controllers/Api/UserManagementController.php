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
 * You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <https://www.gnu.org/>.
 */

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AuthorizationService;
use App\Services\LocalAuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * User management API for admins.
 * All endpoints require admin role.
 */
class UserManagementController extends Controller
{
    public function __construct(
        private AuthorizationService $authorizationService,
        private LocalAuthService $localAuthService
    ) {
    }

    /**
     * List available roles from .roles.json
     *
     * @OA\Get(
     *     path="/api/v1/admin/roles",
     *     operationId="listRoles",
     *     tags={"Admin"},
     *     summary="List available roles",
     *     description="Returns the list of role names defined in .roles.json.",
     *     @OA\Response(response="200", description="Roles list", @OA\JsonContent(
     *         @OA\Property(property="roles", type="array", @OA\Items(type="string"))
     *     )),
     *     @OA\Response(response="401", description="Authentication required"),
     *     @OA\Response(response="403", description="Admin access required")
     * )
     */
    public function roles(): JsonResponse
    {
        $dataPath = rtrim((string) config('data.path', base_path('../data')), \DIRECTORY_SEPARATOR);
        $path = $dataPath . \DIRECTORY_SEPARATOR . '.roles.json';

        if (! is_file($path)) {
            return response()->json(['roles' => []]);
        }

        $json = @file_get_contents($path);
        if ($json === false) {
            return response()->json(['roles' => []]);
        }

        $data = json_decode($json, true);
        if (! is_array($data)) {
            return response()->json(['roles' => []]);
        }

        return response()->json(['roles' => array_keys($data)]);
    }

    public function showRole(string $roleName): JsonResponse
    {
        $data = $this->loadRoles();
        if (! isset($data[$roleName])) {
            return response()->json(['message' => 'Role not found'], 404);
        }

        return response()->json([
            'name' => $roleName,
            'rules' => $data[$roleName]['rules'] ?? [],
        ]);
    }

    public function storeRole(Request $request): JsonResponse
    {
        $roleName = $request->input('name');
        if (! is_string($roleName) || $roleName === '') {
            return response()->json(['message' => 'Role name is required'], 400);
        }

        $data = $this->loadRoles();
        if (isset($data[$roleName])) {
            return response()->json(['message' => 'Role already exists'], 400);
        }

        $data[$roleName] = ['rules' => []];
        $this->saveRoles($data);

        return response()->json([
            'name' => $roleName,
            'rules' => [],
        ], 201);
    }

    public function updateRole(Request $request, string $roleName): JsonResponse
    {
        $data = $this->loadRoles();
        if (! isset($data[$roleName])) {
            return response()->json(['message' => 'Role not found'], 404);
        }

        $rules = $request->input('rules');
        if (! is_array($rules)) {
            return response()->json(['message' => 'rules must be an array'], 400);
        }

        foreach ($rules as $rule) {
            if (! is_array($rule) || ! isset($rule['permission'])) {
                return response()->json(['message' => 'Each rule must have a permission field'], 400);
            }
            if (! in_array($rule['permission'], ['read', 'write', 'none'], true)) {
                return response()->json(['message' => 'Invalid permission: ' . $rule['permission']], 400);
            }
        }

        $data[$roleName]['rules'] = array_values($rules);
        $this->saveRoles($data);

        return response()->json([
            'name' => $roleName,
            'rules' => $data[$roleName]['rules'],
        ]);
    }

    public function destroyRole(string $roleName): JsonResponse
    {
        $data = $this->loadRoles();
        if (! isset($data[$roleName])) {
            return response()->json(['message' => 'Role not found'], 404);
        }

        unset($data[$roleName]);
        $this->saveRoles($data);

        return response()->json(['message' => 'Role deleted successfully']);
    }

    public function getEntityTypes(): JsonResponse
    {
        $dataPath = rtrim((string) config('data.path', base_path('../data')), \DIRECTORY_SEPARATOR);

        if (! is_dir($dataPath)) {
            return response()->json(['entityTypes' => []]);
        }

        $types = [];
        $repos = scandir($dataPath);
        foreach ($repos as $repo) {
            if ($repo === '.' || $repo === '..' || str_starts_with($repo, '.')) {
                continue;
            }
            $repoPath = $dataPath . \DIRECTORY_SEPARATOR . $repo;
            if (! is_dir($repoPath)) {
                continue;
            }

            $branches = scandir($repoPath);
            foreach ($branches as $branch) {
                if ($branch === '.' || $branch === '..') {
                    continue;
                }
                $branchPath = $repoPath . \DIRECTORY_SEPARATOR . $branch;
                if (! is_dir($branchPath)) {
                    continue;
                }

                $dirs = scandir($branchPath);
                foreach ($dirs as $dir) {
                    if ($dir === '.' || $dir === '..' || ! is_dir($branchPath . \DIRECTORY_SEPARATOR . $dir)) {
                        continue;
                    }
                    $types[$dir] = true;
                }
                break;
            }
        }

        return response()->json(['entityTypes' => array_keys($types)]);
    }

    private function loadRoles(): array
    {
        $dataPath = rtrim((string) config('data.path', base_path('../data')), \DIRECTORY_SEPARATOR);
        $path = $dataPath . \DIRECTORY_SEPARATOR . '.roles.json';

        if (! is_file($path)) {
            return [];
        }

        $json = @file_get_contents($path);
        if ($json === false) {
            return [];
        }

        $data = json_decode($json, true);

        return is_array($data) ? $data : [];
    }

    private function saveRoles(array $data): void
    {
        $dataPath = rtrim((string) config('data.path', base_path('../data')), \DIRECTORY_SEPARATOR);
        $path = $dataPath . \DIRECTORY_SEPARATOR . '.roles.json';

        file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    }

    /**
     * List all users from .auth.json
     *
     * @OA\Get(
     *     path="/api/v1/admin/users",
     *     operationId="listUsers",
     *     tags={"Admin"},
     *     summary="List all users",
     *     description="Returns a list of all users with their roles and permissions.",
     *     @OA\Response(response="200", description="Users list", @OA\JsonContent(
     *         @OA\Property(property="users", type="array", @OA\Items(
     *             @OA\Property(property="username", type="string"),
     *             @OA\Property(property="access", type="boolean"),
     *             @OA\Property(property="isAdmin", type="boolean"),
     *             @OA\Property(property="repositories", type="object")
     *         ))
     *     )),
     *     @OA\Response(response="401", description="Authentication required"),
     *     @OA\Response(response="403", description="Admin access required")
     * )
     */
    public function index(): JsonResponse
    {
        $authFilePath = $this->getAuthJsonPath();
        $data = $this->loadAuthData($authFilePath);

        $users = [];
        foreach ($data as $username => $userData) {
            if (!is_array($userData)) {
                continue;
            }
            $users[] = [
                'username' => $username,
                'access' => $userData['access'] ?? true,
                'isAdmin' => !empty($userData['isAdmin']),
                'repositories' => $userData['repositories'] ?? (object)[],
            ];
        }

        return response()->json(['users' => $users]);
    }

    /**
     * Update a user's admin status and repository roles
     *
     * @OA\Put(
     *     path="/api/v1/admin/users/{username}",
     *     operationId="updateUser",
     *     tags={"Admin"},
     *     summary="Update user",
     *     description="Update a user's admin status and repository role assignments.",
     *     @OA\Parameter(name="username", in="path", required=true, description="Username to update", @OA\Schema(type="string")),
     *     @OA\RequestBody(required=true, @OA\JsonContent(
     *         @OA\Property(property="isAdmin", type="boolean"),
     *         @OA\Property(property="repositories", type="object")
     *     )),
     *     @OA\Response(response="200", description="User updated", @OA\JsonContent(
     *         @OA\Property(property="username", type="string"),
     *         @OA\Property(property="isAdmin", type="boolean"),
     *         @OA\Property(property="repositories", type="object")
     *     )),
     *     @OA\Response(response="401", description="Authentication required"),
     *     @OA\Response(response="403", description="Admin access required"),
     *     @OA\Response(response="404", description="User not found")
     * )
     */
    public function update(Request $request, string $username): JsonResponse
    {
        $usernameLower = strtolower($username);
        $authFilePath = $this->getAuthJsonPath();
        $data = $this->loadAuthData($authFilePath);

        if (!isset($data[$usernameLower])) {
            return response()->json(['message' => 'User not found'], 404);
        }

        if ($request->has('isAdmin')) {
            $data[$usernameLower]['isAdmin'] = (bool) $request->input('isAdmin');
        }

        if ($request->has('repositories')) {
            $repositories = $request->input('repositories');
            if (is_array($repositories)) {
                $data[$usernameLower]['repositories'] = $repositories;
            }
        }

        $this->saveAuthData($authFilePath, $data);

        return response()->json([
            'username' => $usernameLower,
            'isAdmin' => !empty($data[$usernameLower]['isAdmin']),
            'repositories' => $data[$usernameLower]['repositories'] ?? (object)[],
        ]);
    }

    /**
     * Generate a new password for a user
     *
     * @OA\Post(
     *     path="/api/v1/admin/users/{username}/password",
     *     operationId="generatePassword",
     *     tags={"Admin"},
     *     summary="Generate new password",
     *     description="Generates a new random password for the specified user. The password is returned only once and cannot be retrieved again.",
     *     @OA\Parameter(name="username", in="path", required=true, description="Username", @OA\Schema(type="string")),
     *     @OA\Response(response="200", description="Password generated", @OA\JsonContent(
     *         @OA\Property(property="username", type="string"),
     *         @OA\Property(property="password", type="string", description="The new password - shown only once")
     *     )),
     *     @OA\Response(response="401", description="Authentication required"),
     *     @OA\Response(response="403", description="Admin access required"),
     *     @OA\Response(response="500", description="Failed to update password")
     * )
     */
    public function generatePassword(string $username): JsonResponse
    {
        $usernameLower = strtolower($username);
        $htpasswdPath = $this->localAuthService->getHtpasswdPath();

        $password = $this->generateRandomPassword();
        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

        $users = [];
        if (is_file($htpasswdPath)) {
            $handle = fopen($htpasswdPath, 'r');
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

        $users[$usernameLower] = "$username:$hash";

        $handle = fopen($htpasswdPath, 'w');
        if ($handle) {
            foreach ($users as $userLine) {
                fwrite($handle, $userLine . "\n");
            }
            fclose($handle);
        } else {
            return response()->json(['message' => 'Failed to update password'], 500);
        }

        return response()->json([
            'username' => $usernameLower,
            'password' => $password,
        ]);
    }

    /**
     * Create a new user
     *
     * @OA\Post(
     *     path="/api/v1/admin/users",
     *     operationId="createUser",
     *     tags={"Admin"},
     *     summary="Create new user",
     *     description="Creates a new user with read access to all existing repositories. Only available in Local authentication mode.",
     *     @OA\RequestBody(required=true, @OA\JsonContent(
     *         @OA\Property(property="username", type="string", description="Username (email format)")
     *     )),
     *     @OA\Response(response="201", description="User created", @OA\JsonContent(
     *         @OA\Property(property="username", type="string"),
     *         @OA\Property(property="password", type="string", description="The password - shown only once"),
     *         @OA\Property(property="isAdmin", type="boolean"),
     *         @OA\Property(property="repositories", type="object")
     *     )),
     *     @OA\Response(response="400", description="User creation not available or validation error"),
     *     @OA\Response(response="401", description="Authentication required"),
     *     @OA\Response(response="403", description="Admin access required")
     * )
     */
    public function store(Request $request): JsonResponse
    {
        if ($this->localAuthService->isEnabled() === false) {
            return response()->json(['message' => 'User creation is only available in Local authentication mode'], 400);
        }

        $username = $request->input('username');
        if (!is_string($username) || $username === '') {
            return response()->json(['message' => 'Username is required'], 400);
        }

        $usernameLower = strtolower($username);
        $password = $this->generateRandomPassword();
        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

        $htpasswdPath = $this->localAuthService->getHtpasswdPath();
        $users = [];
        if (is_file($htpasswdPath)) {
            $handle = fopen($htpasswdPath, 'r');
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

        if (isset($users[$usernameLower])) {
            return response()->json(['message' => 'User already exists'], 400);
        }

        $users[$usernameLower] = "$username:$hash";

        $handle = fopen($htpasswdPath, 'w');
        if ($handle) {
            foreach ($users as $userLine) {
                fwrite($handle, $userLine . "\n");
            }
            fclose($handle);
        } else {
            return response()->json(['message' => 'Failed to create user in htpasswd'], 500);
        }

        $authFilePath = $this->getAuthJsonPath();
        $authData = $this->loadAuthData($authFilePath);

        $authData[$usernameLower] = [
            'access' => true,
            'repositories' => (object)[],
        ];

        $this->saveAuthData($authFilePath, $authData);

        return response()->json([
            'username' => $usernameLower,
            'password' => $password,
            'isAdmin' => false,
            'repositories' => [],
        ], 201);
    }

    /**
     * Delete a user
     *
     * @OA\Delete(
     *     path="/api/v1/admin/users/{username}",
     *     operationId="deleteUser",
     *     tags={"Admin"},
     *     summary="Delete user",
     *     description="Removes a user from both .auth.json and .htpasswd.",
     *     @OA\Parameter(name="username", in="path", required=true, description="Username to delete", @OA\Schema(type="string")),
     *     @OA\Response(response="200", description="User deleted", @OA\JsonContent(
     *         @OA\Property(property="message", type="string")
     *     )),
     *     @OA\Response(response="401", description="Authentication required"),
     *     @OA\Response(response="403", description="Admin access required")
     * )
     */
    public function destroy(string $username): JsonResponse
    {
        $usernameLower = strtolower($username);

        $authFilePath = $this->getAuthJsonPath();
        $authData = $this->loadAuthData($authFilePath);

        if (isset($authData[$usernameLower])) {
            unset($authData[$usernameLower]);
            $this->saveAuthData($authFilePath, $authData);
        }

        $htpasswdPath = $this->localAuthService->getHtpasswdPath();
        if (is_file($htpasswdPath)) {
            $users = [];
            $handle = fopen($htpasswdPath, 'r');
            if ($handle) {
                while (($line = fgets($handle)) !== false) {
                    $line = rtrim($line, "\r\n");
                    $parts = explode(':', $line, 2);
                    if (count($parts) === 2 && strtolower($parts[0]) !== $usernameLower) {
                        $users[] = $line;
                    }
                }
                fclose($handle);
            }

            $handle = fopen($htpasswdPath, 'w');
            if ($handle) {
                foreach ($users as $userLine) {
                    fwrite($handle, $userLine . "\n");
                }
                fclose($handle);
            }
        }

        return response()->json(['message' => 'User deleted successfully']);
    }

    private function getAuthJsonPath(): string
    {
        $dataPath = rtrim((string) config('data.path', base_path('../data')), \DIRECTORY_SEPARATOR);

        return $dataPath . \DIRECTORY_SEPARATOR . '.auth.json';
    }

    private function loadAuthData(string $path): array
    {
        if (!is_file($path)) {
            return [];
        }

        $json = @file_get_contents($path);
        if ($json === false) {
            return [];
        }

        $data = json_decode($json, true);

        return is_array($data) ? $data : [];
    }

    private function saveAuthData(string $path, array $data): bool
    {
        $dir = dirname($path);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        return file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) !== false;
    }

    private function generateRandomPassword(int $length = 10): string
    {
        $characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        $result = '';
        $charsLength = strlen($characters);

        for ($i = 0; $i < $length; $i++) {
            $result .= $characters[random_int(0, $charsLength - 1)];
        }

        return $result;
    }
}
