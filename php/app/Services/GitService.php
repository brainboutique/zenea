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

use RuntimeException;
use Symfony\Component\Process\Process;
use Symfony\Component\Process\ExecutableFinder;

class GitService
{
    private string $dataPath;

    /** When set, run() and ensureConfigured() use this instead of dataPath (for repo/branch-specific operations). */
    private ?string $overrideDataPath = null;

    /** Branch name: allow letters, digits, / - _ . (common in Git branch names) */
    private const BRANCH_PATTERN = '#^[a-zA-Z0-9/_.-]+$#';

    public function __construct()
    {
        $this->dataPath = config('data.path');
    }

    private function getWorkingPath(): string
    {
        return $this->overrideDataPath !== null && $this->overrideDataPath !== ''
            ? $this->overrideDataPath
            : $this->dataPath;
    }

    /**
     * Run a git command in the data directory (or override path when set).
     *
     * @param  array<int, string>  $args  Git subcommand and arguments (e.g. ['add', '-A'] or ['remote', 'get-url', 'origin'])
     * @return string Command output
     * @throws \RuntimeException on failure
     */
    private function run(array $args): string
    {
        return $this->runInDirectory($this->getWorkingPath(), $args);
    }

    private function runInDirectory(string $directory, array $args): string
    {
        $finder = new ExecutableFinder();
        $gitPath = $finder->find('git', 'git');
        $command = array_merge([$gitPath], $args);

        $process = new Process($command);
        $process->setWorkingDirectory($directory);
        $process->setTimeout(300);

        // Pass parent environment so the subprocess uses the same DNS/network context.
        $env = getenv();
        if (is_array($env) && $env !== []) {
            $process->setEnv($env);
        }

        $process->run();

        if (! $process->isSuccessful()) {
            $err = trim($process->getErrorOutput() ?: $process->getOutput() ?: '');
            throw new RuntimeException($err !== '' ? $err : 'Git command failed.');
        }

        return $process->getOutput();
    }

    /**
     * Ensure the data path exists, is a git repository, and has remote "origin" configured.
     *
     * @throws \RuntimeException
     */
    private function ensureConfigured(): void
    {
        $path = $this->getWorkingPath();
        if (! is_dir($path)) {
            throw new RuntimeException('Data path does not exist: ' . $path);
        }

        $gitDir = $path . DIRECTORY_SEPARATOR . '.git';
        if (! is_dir($gitDir)) {
            throw new RuntimeException('Data path is not a Git repository. Initialize it and add remote origin (e.g. git remote add origin <url>).');
        }

        try {
            $this->run(['remote', 'get-url', 'origin']);
        } catch (RuntimeException $e) {
            throw new RuntimeException('Data repository has no remote "origin". Add it with: git remote add origin <url>');
        }
    }

    /**
     * Get current branch name (e.g. "main"). Throws if HEAD is detached.
     */
    private function getCurrentBranchName(): string
    {
        $output = trim($this->run(['rev-parse', '--abbrev-ref', 'HEAD']));

        if ($output === '' || $output === 'HEAD') {
            throw new RuntimeException('HEAD is detached; cannot determine branch.');
        }

        return $output;
    }

    /**
     * Build an HTTPS URL with access-token authentication.
     */
    private function buildUrlWithToken(string $originUrl, string $token, string $username = 'oauth2'): string
    {
        $parsed = parse_url($originUrl);
        if ($parsed === false || ! isset($parsed['host'])) {
            return $originUrl;
        }

        $scheme = $parsed['scheme'] ?? 'https';
        $host = $parsed['host'];
        $port = isset($parsed['port']) ? ':' . $parsed['port'] : '';
        $path = $parsed['path'] ?? '/';
        if ($path !== '' && ! str_starts_with($path, '/')) {
            $path = '/' . $path;
        }

        $auth = rawurlencode($username) . ':' . rawurlencode($token);

        return $scheme . '://' . $auth . '@' . $host . $port . $path;
    }

    /**
     * Run a callable that performs remote operations (fetch/push). If GIT_ACCESS_TOKEN is set,
     * temporarily set origin URL to include the token, then restore original URL.
     */
    private function withRemoteAuth(callable $operation): mixed
    {
        $token = config('data.git_access_token');
        if ($token === null || $token === '') {
            return $operation();
        }

        $originalUrl = trim($this->run(['remote', 'get-url', 'origin']));
        $username = config('data.git_username', 'oauth2');
        $authUrl = $this->buildUrlWithToken($originalUrl, $token, $username);

        try {
            $this->run(['remote', 'set-url', 'origin', $authUrl]);

            return $operation();
        } finally {
            $this->run(['remote', 'set-url', 'origin', $originalUrl]);
        }
    }

    /**
     * Ensure git user.name and user.email are set in the data repo when provided via env.
     */
    private function ensureIdentity(): void
    {
        $name = (string) (config('data.git_user_name') ?? '');
        $email = (string) (config('data.git_user_email') ?? '');

        if ($name === '' && $email === '') {
            return;
        }

        if ($name !== '') {
            $this->run(['config', 'user.name', $name]);
        }
        if ($email !== '') {
            $this->run(['config', 'user.email', $email]);
        }
    }

    private function ensureMetaGitignore(): void
    {
        $gitignorePath = $this->getWorkingPath() . DIRECTORY_SEPARATOR . '.gitignore';
        $content = '';
        if (is_file($gitignorePath)) {
            $content = file_get_contents($gitignorePath) ?: '';
        }
        if (strpos($content, '.meta/') === false) {
            $newContent = $content . ($content !== '' && !str_ends_with($content, "\n") ? "\n" : '') . ".meta/\n";
            file_put_contents($gitignorePath, $newContent);
        }
    }

    /**
     * Commit all changes in the data directory and push to the configured remote.
     * When $dataPath is provided, operates in that directory instead of config data.path.
     *
     * @param  string|null  $message  Optional commit message
     * @param  string|null  $dataPath  Optional path (e.g. /data/repoName/branch); when null, uses config data.path
     * @return array{success: bool, message: string, output?: string, error?: string}
     */
    public function commitAndPush(?string $message = null, ?string $dataPath = null): array
    {
        $previous = $this->overrideDataPath;
        if ($dataPath !== null && $dataPath !== '') {
            $this->overrideDataPath = $dataPath;
        }
        try {
            return $this->doCommitAndPush($message);
        } finally {
            $this->overrideDataPath = $previous;
        }
    }

    /**
     * @return array{success: bool, message: string, output?: string, error?: string}
     */
    private function doCommitAndPush(?string $message): array
    {
        $this->ensureConfigured();

        $message = $message !== null && trim($message) !== ''
            ? trim($message)
            : 'Update data from API at ' . date('c');

        $this->ensureIdentity();
        $this->ensureMetaGitignore();

        try {
            $this->run(['add', '-A']);
        } catch (RuntimeException $e) {
            return [
                'success' => false,
                'message' => 'Failed to stage changes',
                'error' => trim($e->getMessage()),
            ];
        }

        try {
            $status = $this->run(['status', '--porcelain']);
        } catch (RuntimeException $e) {
            return [
                'success' => false,
                'message' => 'Failed to check status',
                'error' => trim($e->getMessage()),
            ];
        }

        if (trim($status) === '') {
            return [
                'success' => true,
                'message' => 'No changes to commit',
            ];
        }

        try {
            $this->run(['commit', '-m', $message]);
        } catch (RuntimeException $e) {
            return [
                'success' => false,
                'message' => 'Failed to commit',
                'error' => trim($e->getMessage()),
            ];
        }

        $branch = $this->getCurrentBranchName();
        try {
            $output = $this->withRemoteAuth(fn () => $this->run(['push', '-u', 'origin', $branch]));
        } catch (RuntimeException $e) {
            return [
                'success' => false,
                'message' => 'Failed to push',
                'error' => trim($e->getMessage()),
            ];
        }

        return [
            'success' => true,
            'message' => 'Committed and pushed successfully',
            'output' => trim($output),
        ];
    }

    /**
     * Pull from remote and force-overwrite local changes in the given repo/branch directory.
     * When the branch directory does not exist: if $basedOn is provided, creates it by cloning that remote branch into the subfolder then creating a new local branch named $branch; if $basedOn is not provided, returns an error. When the branch directory already exists: if $basedOn is provided, returns an error; otherwise fetches and resets to origin/$branch.
     *
     * @return array{success: bool, message: string, output?: string, error?: string}
     */
    public function pullInRepoBranch(string $repoName, string $branch, ?string $basedOn = null): array
    {
        $repoName = trim($repoName);
        $branch = trim($branch);
        if ($repoName === '' || $branch === '') {
            return [
                'success' => false,
                'message' => 'Repository name and branch are required.',
            ];
        }
        $gitRoot = rtrim((string) config('data.git_root', base_path('../data')), DIRECTORY_SEPARATOR);
        $gitRoot = realpath($gitRoot) ?: $gitRoot;
        $repoPath = $gitRoot . DIRECTORY_SEPARATOR . $repoName;
        $branchPath = $repoPath . DIRECTORY_SEPARATOR . $branch;

        $branchDirExists = is_dir($branchPath);
        $firstDir = $this->getFirstBranchDirectoryInRepo($repoPath);
        $repoHasGitBranches = $firstDir !== null;

        $basedOn = is_string($basedOn) ? trim($basedOn) : null;
        $sourcePath = $basedOn !== null && $basedOn !== '' ? $repoPath . DIRECTORY_SEPARATOR . $basedOn : null;
        $sourceIsGitControlled = $sourcePath !== null && $this->isDirectoryGitControlled($sourcePath);

        $useNonGitFlow = ! $repoHasGitBranches || ($basedOn !== null && $basedOn !== '' && ! $sourceIsGitControlled);

        if ($useNonGitFlow) {
            return $this->createOrSyncNonGitBranch($repoPath, $branchPath, $branchDirExists, $basedOn);
        }

        if ($branchDirExists && $basedOn !== null && $basedOn !== '') {
            return [
                'success' => false,
                'message' => 'Branch directory already exists. Cannot create from basedOn.',
            ];
        }

        if (! $branchDirExists) {
            if ($basedOn !== null && $basedOn !== '') {
                $createResult = $this->createBranchDirectoryFromUpstreamBasedOn($repoName, $branch, trim($basedOn));
            } else {
                $createResult = $this->createBranchDirectoryFromUpstream($repoName, $branch);
            }
            if (! $createResult['success']) {
                return $createResult;
            }
            // New branch created from basedOn: push to origin then return (do not run doPull)
            $previous = $this->overrideDataPath;
            $this->overrideDataPath = realpath($branchPath) ?: $branchPath;
            try {
                $pushResult = $this->doPushCurrentBranchToOrigin();
                if (! $pushResult['success']) {
                    return $pushResult;
                }
                $this->clearMetaDirectory($branchPath);

                return [
                    'success' => true,
                    'message' => $createResult['message'] . ' ' . ($pushResult['message'] ?? 'Pushed to origin.'),
                    'output' => $pushResult['output'] ?? null,
                ];
            } finally {
                $this->overrideDataPath = $previous;
            }
        }

        $previous = $this->overrideDataPath;
        $this->overrideDataPath = realpath($branchPath) ?: $branchPath;
        try {
            return $this->doPull();
        } finally {
            $this->overrideDataPath = $previous;
        }
    }

    /**
     * Create or update a non-GIT-backed branch directory. When the branch directory does not exist, it is created.
     * When $basedOn is provided and the source directory exists, copies all .json files (recursively) from the source
     * branch directory into the new branch directory.
     *
     * @return array{success: bool, message: string, output?: string, error?: string}
     */
    private function createOrSyncNonGitBranch(string $repoPath, string $branchPath, bool $branchDirExists, ?string $basedOn): array
    {
        if (! is_dir($repoPath) && ! @mkdir($repoPath, 0775, true) && ! is_dir($repoPath)) {
            return [
                'success' => false,
                'message' => 'Failed to create repository directory: ' . $repoPath,
            ];
        }

        if (! $branchDirExists) {
            if (! @mkdir($branchPath, 0775, true) && ! is_dir($branchPath)) {
                return [
                    'success' => false,
                    'message' => 'Failed to create branch directory: ' . $branchPath,
                ];
            }
        }

        $basedOn = is_string($basedOn) ? trim($basedOn) : '';
        if ($basedOn !== '') {
            $sourcePath = $repoPath . DIRECTORY_SEPARATOR . $basedOn;

            // Special-case when copying from branch "default": if repo/branch path (e.g. data/local/default) does not exist
            // but repo path (e.g. data/local) does, use the repo path.
            if (! is_dir($sourcePath) && $basedOn === 'default' && is_dir($repoPath)) {
                $sourcePath = $repoPath;
            }

            if (! is_dir($sourcePath)) {
                return [
                    'success' => false,
                    'message' => 'Source branch directory for copy does not exist: ' . $sourcePath,
                ];
            }

            $this->copyJsonFilesRecursive($sourcePath, $branchPath);
            // When copying from another local branch, keep the copied meta JSON files as-is.
        } else {
            // When not copying from another branch, clear meta so it can be rebuilt for the new branch.
            $this->clearMetaDirectory($branchPath);
        }

        return [
            'success' => true,
            'message' => 'Non-GIT branch directory is ready.',
        ];
    }

    /**
     * Recursively copy all .json files from $sourceDir to $targetDir, preserving subdirectory structure.
     */
    private function copyJsonFilesRecursive(string $sourceDir, string $targetDir): void
    {
        error_log("###COPY ".$sourceDir."->".$targetDir);
        $items = @scandir($sourceDir);
        if ($items === false) {
            return;
        }
        error_log("###2");
        foreach ($items as $item) {
            error_log("###3".$item);
            if ($item === '.' || $item === '..') {
                continue;
            }
            $sourcePath = $sourceDir . DIRECTORY_SEPARATOR . $item;
            $targetPath = $targetDir . DIRECTORY_SEPARATOR . $item;
            if (is_dir($sourcePath)) {
                error_log("###COPY2 ".$sourcePath."->".$targetPath);
                if (! is_dir($targetPath) && ! @mkdir($targetPath, 0775, true) && ! is_dir($targetPath)) {
                    continue;
                }
                $this->copyJsonFilesRecursive($sourcePath, $targetPath);
            } elseif (is_file($sourcePath) && str_ends_with(strtolower($item), '.json')) {
                error_log("###COPY3 ".$sourcePath."->".$targetPath);
                @copy($sourcePath, $targetPath);
            }
        }
    }

    /**
     * Create a new branch directory by cloning the remote branch $basedOn into the subfolder $branch, then creating a new local branch named $branch.
     *
     * @return array{success: bool, message: string, output?: string, error?: string}
     */
    private function createBranchDirectoryFromUpstreamBasedOn(string $repoName, string $branch, string $basedOn): array
    {
        $gitRoot = rtrim((string) config('data.git_root', base_path('../data')), DIRECTORY_SEPARATOR);
        $gitRoot = realpath($gitRoot) ?: $gitRoot;
        $repoPath = $gitRoot . DIRECTORY_SEPARATOR . $repoName;
        $branchPath = $repoPath . DIRECTORY_SEPARATOR . $branch;

        if (is_dir($branchPath)) {
            return [
                'success' => false,
                'message' => 'Branch directory already exists.',
            ];
        }

        $firstDir = $this->getFirstBranchDirectoryInRepo($repoPath);
        if ($firstDir === null) {
            return [
                'success' => false,
                'message' => 'No existing branch directory found in repository. Clone the repository first.',
            ];
        }

        try {
            $originUrl = trim($this->runInDirectory($firstDir, ['remote', 'get-url', 'origin']));
        } catch (RuntimeException $e) {
            return [
                'success' => false,
                'message' => 'Could not get remote URL from existing clone.',
                'error' => trim($e->getMessage()),
            ];
        }

        if (! @mkdir($repoPath, 0775, true) && ! is_dir($repoPath)) {
            return [
                'success' => false,
                'message' => 'Failed to create repository directory: ' . $repoPath,
            ];
        }

        try {
            $this->runInDirectory($gitRoot, [
                'clone',
                '--branch',
                $basedOn,
                '--single-branch',
                $originUrl,
                $branchPath,
            ]);
        } catch (RuntimeException $e) {
            @$this->removeDirectory($branchPath);

            return [
                'success' => false,
                'message' => 'Failed to clone branch from upstream.',
                'error' => trim($e->getMessage()),
            ];
        }

        try {
            $this->runInDirectory($branchPath, ['checkout', '-b', $branch]);
        } catch (RuntimeException $e) {
            @$this->removeDirectory($branchPath);

            return [
                'success' => false,
                'message' => 'Failed to create local branch ' . $branch . '.',
                'error' => trim($e->getMessage()),
            ];
        }

        $this->clearMetaDirectory($branchPath);

        return ['success' => true, 'message' => 'Branch directory created from origin/' . $basedOn . '.'];
    }

    /**
     * Create a new branch directory by cloning that branch from the remote (for switching to an existing remote branch).
     *
     * @return array{success: bool, message: string, output?: string, error?: string}
     */
    private function createBranchDirectoryFromUpstream(string $repoName, string $branch): array
    {
        $gitRoot = rtrim((string) config('data.git_root', base_path('../data')), DIRECTORY_SEPARATOR);
        $gitRoot = realpath($gitRoot) ?: $gitRoot;
        $repoPath = $gitRoot . DIRECTORY_SEPARATOR . $repoName;
        $branchPath = $repoPath . DIRECTORY_SEPARATOR . $branch;

        if (is_dir($branchPath)) {
            return [
                'success' => false,
                'message' => 'Branch directory already exists.',
            ];
        }

        $firstDir = $this->getFirstBranchDirectoryInRepo($repoPath);
        if ($firstDir === null) {
            return [
                'success' => false,
                'message' => 'No existing branch directory found in repository. Clone the repository first.',
            ];
        }

        try {
            $originUrl = trim($this->runInDirectory($firstDir, ['remote', 'get-url', 'origin']));
        } catch (RuntimeException $e) {
            return [
                'success' => false,
                'message' => 'Could not get remote URL from existing clone.',
                'error' => trim($e->getMessage()),
            ];
        }

        if (! @mkdir($repoPath, 0775, true) && ! is_dir($repoPath)) {
            return [
                'success' => false,
                'message' => 'Failed to create repository directory: ' . $repoPath,
            ];
        }

        try {
            $this->runInDirectory($gitRoot, [
                'clone',
                '--branch',
                $branch,
                '--single-branch',
                $originUrl,
                $branchPath,
            ]);
        } catch (RuntimeException $e) {
            return [
                'success' => false,
                'message' => 'Failed to clone branch from upstream.',
                'error' => trim($e->getMessage()),
            ];
        }

        $this->clearMetaDirectory($branchPath);

        return ['success' => true, 'message' => 'Branch directory created.'];
    }

    private function removeDirectory(string $path): void
    {
        if (! is_dir($path)) {
            return;
        }
        $items = @scandir($path);
        if ($items === false) {
            return;
        }
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $full = $path . DIRECTORY_SEPARATOR . $item;
            if (is_dir($full)) {
                $this->removeDirectory($full);
            } else {
                @unlink($full);
            }
        }
        @rmdir($path);
    }

    /**
     * Remove all files (and subdirs) in the ".meta" subdirectory of the given path, if it exists.
     * Used after pull or branch switch so cached meta (e.g. facets.json, applications.json) is rebuilt from current data.
     */
    private function clearMetaDirectory(string $branchPath): void
    {
        $metaDir = $branchPath . DIRECTORY_SEPARATOR . '.meta';
        if (! is_dir($metaDir)) {
            return;
        }
        $items = @scandir($metaDir);
        if ($items === false) {
            return;
        }
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $full = $metaDir . DIRECTORY_SEPARATOR . $item;
            if (is_dir($full)) {
                $this->removeDirectory($full);
            } else {
                @unlink($full);
            }
        }
    }

    /**
     * Return the first subdirectory of $repoPath that looks like a branch work tree (has .git). Skips .git and non-dirs.
     */
    private function getFirstBranchDirectoryInRepo(string $repoPath): ?string
    {
        if (! is_dir($repoPath)) {
            return null;
        }
        $items = @scandir($repoPath);
        if ($items === false) {
            return null;
        }
        foreach ($items as $name) {
            if ($name === '.' || $name === '..' || $name === '.git') {
                continue;
            }
            $full = $repoPath . DIRECTORY_SEPARATOR . $name;
            if (! is_dir($full)) {
                continue;
            }
            if (is_dir($full . DIRECTORY_SEPARATOR . '.git')) {
                return $full;
            }
        }
        return null;
    }

    /**
     * @return array{success: bool, message: string, output?: string, error?: string}
     */
    private function doPull(): array
    {
        $this->ensureConfigured();

        $branch = $this->getCurrentBranchName();

        // Ensure this directory only fetches its own branch (no cross refspec from another branch)
        try {
            $this->run([
                'config',
                'remote.origin.fetch',
                '+refs/heads/' . $branch . ':refs/remotes/origin/' . $branch,
            ]);
        } catch (RuntimeException $e) {
            return [
                'success' => false,
                'message' => 'Failed to set origin fetch refspec for branch ' . $branch,
                'error' => trim($e->getMessage()),
            ];
        }

        try {
            $output = $this->withRemoteAuth(fn () => $this->run(['fetch', 'origin']));
        } catch (RuntimeException $e) {
            return [
                'success' => false,
                'message' => 'Failed to fetch from origin',
                'error' => trim($e->getMessage()),
            ];
        }

        try {
            $this->run(['reset', '--hard', 'origin/' . $branch]);
        } catch (RuntimeException $e) {
            return [
                'success' => false,
                'message' => 'Failed to reset to origin/' . $branch,
                'error' => trim($e->getMessage()),
            ];
        }

        try {
            $this->run(['clean', '-fd']);
        } catch (RuntimeException $e) {
            // ignore clean failure
        }

        $this->clearMetaDirectory($this->getWorkingPath());

        return [
            'success' => true,
            'message' => 'Pulled and reset to origin/' . $branch,
            'output' => trim($output),
        ];
    }

    /**
     * Push the current branch to origin and set upstream. Uses overrideDataPath when set.
     *
     * @return array{success: bool, message: string, output?: string, error?: string}
     */
    private function doPushCurrentBranchToOrigin(): array
    {
        $this->ensureConfigured();
        $branch = $this->getCurrentBranchName();
        try {
            $output = $this->withRemoteAuth(fn () => $this->run(['push', '-u', 'origin', $branch]));
        } catch (RuntimeException $e) {
            return [
                'success' => false,
                'message' => 'Failed to push to origin',
                'error' => trim($e->getMessage()),
            ];
        }

        return [
            'success' => true,
            'message' => 'Pushed to origin/' . $branch,
            'output' => trim($output),
        ];
    }

    /**
     * Pull from remote in the current working path (legacy; use pullInRepoBranch for repo/branch-specific pull).
     *
     * @return array{success: bool, message: string, output?: string, error?: string}
     */
    public function pull(): array
    {
        return $this->doPull();
    }

    /**
     * Clone a repository (OAuth URL) into /data/<repo-name>/<default-branch>.
     *
     * If the <repo-name> directory already exists under the Git data root, the
     * operation fails with "Repository already exists.".
     *
     * The default branch is detected from the remote (HEAD) and used instead
     * of assuming "main". Only the <default-branch> directory is a Git working
     * copy so that additional branch directories can be added later.
     *
     * @return array{success: bool, message: string, output?: string, error?: string}
     */
    public function cloneRepository(string $repositoryUrl): array
    {
        $repositoryUrl = trim($repositoryUrl);
        if ($repositoryUrl === '') {
            return [
                'success' => false,
                'message' => 'Repository URL must not be empty.',
            ];
        }

        $gitRoot = (string) config('data.git_root', base_path('../data'));
        if (! is_dir($gitRoot)) {
            return [
                'success' => false,
                'message' => 'Git data root does not exist: ' . $gitRoot,
            ];
        }

        $path = parse_url($repositoryUrl, PHP_URL_PATH);
        if (! is_string($path) || $path === '') {
            return [
                'success' => false,
                'message' => 'Invalid repository URL.',
            ];
        }

        $repoBaseName = basename($path);
        if (str_ends_with($repoBaseName, '.git')) {
            $repoBaseName = substr($repoBaseName, 0, -4);
        }

        if ($repoBaseName === '') {
            return [
                'success' => false,
                'message' => 'Could not determine repository name from URL.',
            ];
        }

        $targetBase = rtrim($gitRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $repoBaseName;

        if (file_exists($targetBase)) {
            return [
                'success' => false,
                'message' => 'Repository already exists.',
            ];
        }

        $defaultBranch = 'main';
        try {
            $lsRemote = trim($this->runInDirectory($gitRoot, ['ls-remote', '--symref', $repositoryUrl, 'HEAD']));
            foreach (explode("\n", $lsRemote) as $line) {
                $line = trim($line);
                if ($line === '' || ! str_starts_with($line, 'ref:')) {
                    continue;
                }
                // Example: "ref: refs/heads/main\tHEAD"
                $parts = preg_split('/\s+/', $line);
                if (! isset($parts[1])) {
                    continue;
                }
                $ref = $parts[1]; // refs/heads/main
                if (str_starts_with($ref, 'refs/heads/')) {
                    $defaultBranch = substr($ref, strlen('refs/heads/'));
                    break;
                }
            }
        } catch (RuntimeException $e) {
            // If detection fails, fall back to "main" but still report a usable error if clone fails.
            $defaultBranch = 'main';
        }

        $targetDir = $targetBase . DIRECTORY_SEPARATOR . $defaultBranch;

        if (! is_dir($targetDir) && ! mkdir($targetDir, 0775, true) && ! is_dir($targetDir)) {
            return [
                'success' => false,
                'message' => 'Failed to create target directory: ' . $targetDir,
            ];
        }

        try {
            $output = $this->runInDirectory($gitRoot, [
                'clone',
                '--branch',
                $defaultBranch,
                '--single-branch',
                $repositoryUrl,
                $targetDir,
            ]);
        } catch (RuntimeException $e) {
            return [
                'success' => false,
                'message' => 'Failed to clone repository.',
                'error' => trim($e->getMessage()),
            ];
        }

        return [
            'success' => true,
            'message' => 'Repository cloned to ' . $targetDir,
            'output' => trim($output),
            'repoName' => $repoBaseName,
            'defaultBranch' => $defaultBranch,
        ];
    }

    /**
     * List all branches on the remote (origin) for the given repository.
     * Uses the first branch directory under /data/<repoName>/ (e.g. /data/<repoName>/main/) to run
     * git ls-remote origin and get the full list of branches from the remote. Each /data/<repoName>/<branch>/
     * is a separate checkout (has its own .git). Compares that list with subdirectories of /data/<repoName>/
     * to determine isCloned; for each cloned branch dir, runs git status there to set hasUncommittedChanges.
     *
     * @return array{success: bool, branches?: list<array{name: string, isCloned: bool, hasUncommittedChanges: bool, isGitControlled: bool}>, message?: string, error?: string}
     */
    public function branchesForRepo(string $repoName): array
    {
        $repoName = trim($repoName);
        if ($repoName === '') {
            return [
                'success' => false,
                'message' => 'Repository name is required.',
            ];
        }
        $gitRoot = rtrim((string) config('data.git_root', base_path('../data')), DIRECTORY_SEPARATOR);
        $repoPath = $gitRoot . DIRECTORY_SEPARATOR . $repoName;
        $firstDir = $this->getFirstBranchDirectoryInRepo($repoPath);
        if ($firstDir === null) {
            return [
                'success' => true,
                'branches' => [],
            ];
        }

        $previous = $this->overrideDataPath;
        $this->overrideDataPath = $firstDir;
        try {
            $this->ensureConfigured();
            try {
                $output = $this->withRemoteAuth(fn () => $this->run(['ls-remote', '--refs', 'origin']));
            } catch (RuntimeException $e) {
                return [
                    'success' => false,
                    'message' => 'Failed to list branches from origin',
                    'error' => trim($e->getMessage()),
                ];
            }
            $branchNames = [];
            foreach (explode("\n", $output) as $line) {
                $line = trim($line);
                if ($line === '') {
                    continue;
                }
                $parts = explode("\t", $line, 2);
                if (count($parts) !== 2) {
                    continue;
                }
                $ref = $parts[1];
                if (str_starts_with($ref, 'refs/heads/')) {
                    $branchNames[] = substr($ref, strlen('refs/heads/'));
                }
            }
            sort($branchNames);
        } finally {
            $this->overrideDataPath = $previous;
        }

        $branches = [];
        foreach ($branchNames as $name) {
            $branchPath = $repoPath . DIRECTORY_SEPARATOR . $name;
            $gitPath = $branchPath . DIRECTORY_SEPARATOR . '.git';
            $isCloned = is_dir($branchPath) && (is_dir($gitPath) || is_file($gitPath));
            // All branch names from ls-remote are git-backed (from origin); mark true even when not yet checked out.
            $isGitControlled = true;
            $hasUncommittedChanges = false;
            if ($isCloned && $this->isDirectoryGitControlled($branchPath)) {
                $this->overrideDataPath = $branchPath;
                try {
                    $hasUncommittedChanges = $this->hasUncommittedChanges();
                } catch (RuntimeException) {
                    // ignore per-branch status failure
                } finally {
                    $this->overrideDataPath = $previous;
                }
            }
            $branches[] = [
                'name' => $name,
                'isCloned' => $isCloned,
                'hasUncommittedChanges' => $hasUncommittedChanges,
                'isGitControlled' => $isGitControlled,
            ];
        }

        return [
            'success' => true,
            'branches' => $branches,
        ];
    }

    /**
     * List all branches on the remote for all repositories under the Git data root.
     *
     * @return array{success: bool, repositories?: list<array{repoName: string, branches: list<array{name: string, isCloned: bool, hasUncommittedChanges: bool, isGitControlled: bool}>}>}
     */
    public function branchesAllRepos(): array
    {
        $gitRoot = rtrim((string) config('data.git_root', base_path('../data')), DIRECTORY_SEPARATOR);
        if (! is_dir($gitRoot)) {
            return [
                'success' => false,
                'message' => 'Git data root does not exist: ' . $gitRoot,
            ];
        }

        $repositories = [];
        $entries = @scandir($gitRoot) ?: [];

        /** @var array<string, array<string, array{name: string, isCloned: bool, hasUncommittedChanges: bool, isGitControlled: bool}>> $repoBranchMap */
        $repoBranchMap = [];

        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            $repoPath = $gitRoot . DIRECTORY_SEPARATOR . $entry;
            if (! is_dir($repoPath)) {
                continue;
            }

            $repoBranchMap[$entry] = $repoBranchMap[$entry] ?? [];

            $branchEntries = @scandir($repoPath) ?: [];
            foreach ($branchEntries as $branchName) {
                if ($branchName === '.' || $branchName === '..' || $branchName === '.git') {
                    continue;
                }
                $branchPath = $repoPath . DIRECTORY_SEPARATOR . $branchName;
                if (! is_dir($branchPath)) {
                    continue;
                }

                $isGitControlled = $this->isDirectoryGitControlled($branchPath);

                $repoBranchMap[$entry][$branchName] = [
                    'name' => $branchName,
                    'isCloned' => $isGitControlled,
                    'hasUncommittedChanges' => false,
                    'isGitControlled' => $isGitControlled,
                ];
            }

            $res = $this->branchesForRepo($entry);
            if ($res['success'] ?? false) {
                foreach ($res['branches'] ?? [] as $b) {
                    $name = $b['name'];
                    $repoBranchMap[$entry][$name] = $b;
                }
            }
        }

        foreach ($repoBranchMap as $repoName => $branches) {
            ksort($branches);
            $repositories[] = [
                'repoName' => $repoName,
                'branches' => array_values($branches),
            ];
        }

        usort($repositories, static fn (array $a, array $b): int => strcmp($a['repoName'], $b['repoName']));

        return [
            'success' => true,
            'repositories' => $repositories,
        ];
    }

    /**
     * @return array{success: bool, branches?: list<string>, hasUncommittedChanges?: bool, currentBranch?: string|null, message?: string, error?: string}
     */
    private function doBranches(): array
    {
        $this->ensureConfigured();

        try {
            $this->withRemoteAuth(fn () => $this->run(['fetch', 'origin']));
        } catch (RuntimeException $e) {
            return [
                'success' => false,
                'message' => 'Failed to fetch from origin',
                'error' => trim($e->getMessage()),
            ];
        }

        $hasUncommittedChanges = $this->hasUncommittedChanges();
        $currentBranch = $this->getCurrentBranchNameOrNull();

        $output = trim($this->run(['branch', '-r']));
        $branchNames = [];
        foreach (explode("\n", $output) as $line) {
            $line = trim($line);
            if ($line === '' || str_contains($line, ' -> ')) {
                continue;
            }
            if (str_starts_with($line, 'origin/')) {
                $branchNames[] = substr($line, strlen('origin/'));
            }
        }
        sort($branchNames);

        return [
            'success' => true,
            'branches' => $branchNames,
            'hasUncommittedChanges' => $hasUncommittedChanges,
            'currentBranch' => $currentBranch,
        ];
    }

    /**
     * List branches using the default data path (legacy). Prefer branchesForRepo(repoName) for repo-aware API.
     *
     * @return array{success: bool, branches?: list<string>, hasUncommittedChanges?: bool, currentBranch?: string|null, message?: string, error?: string}
     */
    public function branches(): array
    {
        return $this->doBranches();
    }

    /**
     * Get current branch name, or null if HEAD is detached.
     */
    private function getCurrentBranchNameOrNull(): ?string
    {
        try {
            return $this->getCurrentBranchName();
        } catch (RuntimeException) {
            return null;
        }
    }

    /**
     * Whether the working tree has uncommitted changes to tracked files (staged or unstaged).
     * Ignores untracked files so that e.g. local/generated files do not trigger a positive result.
     */
    private function hasUncommittedChanges(): bool
    {
        try {
            $status = trim($this->run(['status', '--porcelain', '--untracked-files=no']));

            return $status !== '';
        } catch (RuntimeException) {
            return false;
        }
    }

    /**
     * Validate branch name to prevent injection.
     */
    private function validateBranchName(string $branch): void
    {
        if ($branch === '' || ! preg_match(self::BRANCH_PATTERN, $branch)) {
            throw new RuntimeException('Invalid branch name. Use only letters, digits, /, -, _, and .');
        }
    }

    /**
     * Check whether the given branch exists on the remote (after fetch).
     */
    private function branchExistsOnRemote(string $branch): bool
    {
        try {
            $this->run(['rev-parse', '--verify', 'origin/' . $branch]);

            return true;
        } catch (RuntimeException) {
            return false;
        }
    }

    /**
     * Run a git command in the given directory. Returns null on failure (e.g. not a git repo).
     *
     * @param  array<int, string>  $args
     */
    private function runInDirectoryQuiet(string $directory, array $args): ?string
    {
        try {
            return trim($this->runInDirectory($directory, $args));
        } catch (RuntimeException) {
            return null;
        }
    }

    /**
     * Return true if the given directory is inside a git work tree.
     */
    public function isInsideWorkTree(string $directory): bool
    {
        $out = $this->runInDirectoryQuiet($directory, ['rev-parse', '--is-inside-work-tree']);

        return $out === 'true';
    }

    /**
     * Return true if the given directory has its own Git metadata directory (is a Git work tree root or sub-work tree),
     * determined via `git rev-parse --git-dir`. Directories that are merely located under another repository's root
     * (e.g. default/default under the main project repo) are not considered Git-controlled unless their git-dir
     * resolves inside the directory itself.
     */
    private function isDirectoryGitControlled(string $directory): bool
    {
        $gitDir = $this->runInDirectoryQuiet($directory, ['rev-parse', '--git-dir']);
        if ($gitDir === null || $gitDir === '') {
            return false;
        }

        $dirReal = realpath($directory);
        if ($dirReal === false || $dirReal === '') {
            $dirReal = $directory;
        }

        // If git-dir is relative, resolve it against the directory; if absolute, canonicalize it.
        $isAbsolute = str_starts_with($gitDir, DIRECTORY_SEPARATOR)
            || (strlen($gitDir) > 1 && ctype_alpha($gitDir[0]) && $gitDir[1] === ':');
        if ($isAbsolute) {
            $gitReal = realpath($gitDir) ?: $gitDir;
        } else {
            $gitReal = realpath($dirReal . DIRECTORY_SEPARATOR . $gitDir) ?: ($dirReal . DIRECTORY_SEPARATOR . $gitDir);
        }

        $dirReal = rtrim($dirReal, DIRECTORY_SEPARATOR);
        $gitReal = rtrim($gitReal, DIRECTORY_SEPARATOR);

        // Consider the directory git-controlled only when the git-dir is located inside it (own .git folder or similar).
        return str_starts_with($gitReal, $dirReal . DIRECTORY_SEPARATOR)
            || $gitReal === $dirReal . DIRECTORY_SEPARATOR . '.git';
    }

    /**
     * Return the git repository root path for the given directory, or null if not in a git repo.
     */
    public function getTopLevel(string $directory): ?string
    {
        $out = $this->runInDirectoryQuiet($directory, ['rev-parse', '--show-toplevel']);
        if ($out === null || $out === '') {
            return null;
        }

        return $out;
    }

    /**
     * If the given directory is inside a git work tree, run "git add" on the given absolute file paths.
     * Paths are resolved relative to the repo root; only paths under the repo are added.
     *
     * @param  string  $baseDir  Directory containing the files (e.g. data/repo/branch).
     * @param  string[]  $absolutePaths  Absolute paths to the files to add.
     */
    public function addPathsIfUnderGit(string $baseDir, array $absolutePaths): void
    {
        if ($absolutePaths === []) {
            return;
        }
        if (! $this->isInsideWorkTree($baseDir)) {
            return;
        }
        $gitRoot = $this->getTopLevel($baseDir);
        if ($gitRoot === null || $gitRoot === '') {
            return;
        }

        $canonicalRoot = realpath($gitRoot);
        if ($canonicalRoot === false) {
            return;
        }
        $separator = DIRECTORY_SEPARATOR;
        $normalizedRoot = rtrim($canonicalRoot, $separator);
        $relativePaths = [];
        foreach ($absolutePaths as $absPath) {
            $canonicalPath = realpath($absPath);
            $isNewFile = $canonicalPath === false;
            if ($canonicalPath !== false && ! is_file($canonicalPath)) {
                continue;
            }
            if ($isNewFile) {
                $canonicalPath = $absPath;
            }
            if (str_starts_with($canonicalPath, $normalizedRoot . $separator)
                || $canonicalPath === $normalizedRoot) {
                $rel = substr($canonicalPath, strlen($normalizedRoot) + 1);
                $relativePaths[] = str_replace($separator, '/', $rel);
            }
        }
        if ($relativePaths === []) {
            return;
        }
        try {
            $this->runInDirectory($canonicalRoot, array_merge(['add', '--'], $relativePaths));
        } catch (RuntimeException) {
            error_log("Unable to add file to git! ".json_encode($relativePaths));
            // Silently ignore add failure (e.g. permission, or path outside repo).
        }
    }

    /**
     * If the given file path is inside a git repository, run "git add" on it.
     * Convenience for a single file (e.g. from EntityStorageService).
     */
    public function addPathIfUnderGit(string $path): void
    {
        $real = realpath($path);
        if ($real === false || ! is_file($real)) {
            return;
        }
        $this->addPathsIfUnderGit(dirname($real), [$real]);
    }

    /**
     * Get git log for a specific file.
     *
     * @param  string  $repoName  Repository name
     * @param  string  $branch  Branch name
     * @param  string  $type  Entity type (e.g. Application)
     * @param  string  $guid  Entity GUID (filename without .json)
     * @param  int  $limit  Maximum number of commits to return
     * @return array{success: bool, entries?: array<int, array{hash: string, shortHash: string, date: string, message: string}>, message?: string}
     */
    public function getFileHistory(string $repoName, string $branch, string $type, string $guid, int $limit = 50): array
    {
        try {
            $dataPath = rtrim((string) config('data.path', base_path('../data')), \DIRECTORY_SEPARATOR);
            $filePath = $dataPath . \DIRECTORY_SEPARATOR . $repoName . \DIRECTORY_SEPARATOR . $branch . \DIRECTORY_SEPARATOR . $type . \DIRECTORY_SEPARATOR . $guid . '.json';

            if (! is_file($filePath)) {
                return ['success' => false, 'message' => 'File not found: ' . $filePath];
            }

            $gitDir = $this->findGitDirectory(dirname($filePath));
            if ($gitDir === null) {
                return ['success' => false, 'message' => 'Not a git repository'];
            }

            $relativePath = $this->getRelativePath($gitDir, $filePath);

            $command = [
                'log',
                '--format=%H|%h|%aI|%aN|%s',
                '-n',
                (string) $limit,
                '--',
                $relativePath,
            ];

            $output = $this->runInDirectory($gitDir, $command);
            $lines = array_filter(array_map('trim', explode("\n", $output)));

            $entries = [];
            foreach ($lines as $line) {
                $parts = explode('|', $line, 5);
                if (count($parts) >= 4) {
                    $entries[] = [
                        'hash' => $parts[0],
                        'shortHash' => $parts[1],
                        'date' => $parts[2],
                        'author' => $parts[3],
                        'message' => count($parts) >= 5 ? $parts[4] : '',
                    ];
                }
            }

            return ['success' => true, 'entries' => $entries];
        } catch (\Throwable $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    private function findGitDirectory(string $path): ?string
    {
        $dir = $path;
        while ($dir !== '' && $dir !== '.' && $dir !== dirname($dir)) {
            if (is_dir($dir . \DIRECTORY_SEPARATOR . '.git')) {
                return $dir;
            }
            $dir = dirname($dir);
        }

        return null;
    }

    private function getRelativePath(string $gitDir, string $filePath): string
    {
        $separator = \DIRECTORY_SEPARATOR;
        $normalizedGitDir = rtrim($gitDir, $separator);
        $normalizedFilePath = rtrim($filePath, $separator);

        if (str_starts_with($normalizedFilePath, $normalizedGitDir . $separator)) {
            return substr($normalizedFilePath, strlen($normalizedGitDir) + 1);
        }

        return $normalizedFilePath;
    }

    /**
     * Switch the data directory to the given branch and force-overwrite with remote.
     * If the branch does not exist on origin, create it from the current branch and push to origin.
     *
     * @return array{success: bool, message: string, output?: string, error?: string}
     */
    public function switchBranch(string $branch): array
    {
        $this->validateBranchName($branch);
        $this->ensureConfigured();

        // Ensure this repo fetches only the requested branch (no cross refspec)
        try {
            $this->run([
                'config',
                'remote.origin.fetch',
                '+refs/heads/' . $branch . ':refs/remotes/origin/' . $branch,
            ]);
        } catch (RuntimeException $e) {
            return [
                'success' => false,
                'message' => 'Failed to set origin fetch refspec for branch ' . $branch,
                'error' => trim($e->getMessage()),
            ];
        }

        try {
            $this->withRemoteAuth(fn () => $this->run(['fetch', 'origin']));
        } catch (RuntimeException $e) {
            return [
                'success' => false,
                'message' => 'Failed to fetch from origin',
                'error' => trim($e->getMessage()),
            ];
        }

        if ($this->branchExistsOnRemote($branch)) {
            return $this->switchToExistingBranch($branch);
        }

        return $this->createBranchFromCurrentAndPush($branch);
    }

    /**
     * Checkout an existing remote branch and reset to match origin.
     *
     * @return array{success: bool, message: string, output?: string, error?: string}
     */
    private function switchToExistingBranch(string $branch): array
    {
        try {
            $this->run(['checkout', '-B', $branch, 'origin/' . $branch]);
        } catch (RuntimeException $e) {
            return [
                'success' => false,
                'message' => 'Failed to checkout branch ' . $branch,
                'error' => trim($e->getMessage()),
            ];
        }

        try {
            $this->run(['reset', '--hard', 'origin/' . $branch]);
        } catch (RuntimeException $e) {
            return [
                'success' => false,
                'message' => 'Failed to reset to origin/' . $branch,
                'error' => trim($e->getMessage()),
            ];
        }

        try {
            $this->run(['clean', '-fd']);
        } catch (RuntimeException $e) {
            // ignore
        }

        return [
            'success' => true,
            'message' => 'Switched to branch ' . $branch . ' and reset to remote',
        ];
    }

    /**
     * Create a new branch from the current branch and push it to origin.
     *
     * @return array{success: bool, message: string, output?: string, error?: string}
     */
    private function createBranchFromCurrentAndPush(string $branch): array
    {
        try {
            $this->run(['checkout', '-b', $branch]);
        } catch (RuntimeException $e) {
            return [
                'success' => false,
                'message' => 'Failed to create branch ' . $branch,
                'error' => trim($e->getMessage()),
            ];
        }

        try {
            $output = $this->withRemoteAuth(fn () => $this->run(['push', '-u', 'origin', $branch]));
        } catch (RuntimeException $e) {
            return [
                'success' => false,
                'message' => 'Failed to push branch ' . $branch . ' to origin',
                'error' => trim($e->getMessage()),
            ];
        }

        return [
            'success' => true,
            'message' => 'Created branch ' . $branch . ' from current branch and pushed to origin',
            'output' => trim($output),
        ];
    }
}
