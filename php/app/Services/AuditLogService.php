<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

class AuditLogService
{
    private const AUDIT_LOG_FILENAME = 'auditLog.txt';
    private const AUTO_COMMIT_AGE_SECONDS = 3600;

    /** Upper bound for the commit message so a long-failing audit log stays cheap to handle. */
    private const MAX_COMMIT_MESSAGE_BYTES = 100000;

    /** Above this size the audit log indicates that auto-commit keeps failing. */
    private const LARGE_LOG_BYTES = 262144;

    public function __construct(
        private readonly GitService $gitService,
    ) {
    }

    /**
     * Append an audit log entry for an API-triggered write.
     *
     * @param  string  $repoBranchPath  The repo/branch base path (e.g. /data/repoName/branch)
     * @param  string  $userId
     * @param  string  $entityType
     * @param  string  $entityGuid
     */
    public function logChange(string $repoBranchPath, string $userId, string $entityType, string $entityGuid): void
    {
        $logPath = $this->auditLogPath($repoBranchPath);
        $metaDir = dirname($logPath);
        if (! is_dir($metaDir)) {
            @mkdir($metaDir, 0755, true);
        }

        $line = $userId . ' | ' . date('Y-m-d H:i:s') . ' | ' . $entityType . ' | ' . $entityGuid . ' | Changed' . "\n";
        @file_put_contents($logPath, $line, FILE_APPEND | LOCK_EX);
    }

    /**
     * Check if the audit log file exists and is older than 1 hour.
     * If so, auto-commit all changes using the log contents as commit message,
     * then remove the audit log. Failures are logged but do not throw.
     *
     * @param  string  $repoBranchPath  The repo/branch base path (e.g. /data/repoName/branch)
     */
    public function autoCommitIfNeeded(string $repoBranchPath): void
    {
        // Auto-commit is a housekeeping side effect of a write request: it must never
        // fail (or take down) the request that triggered it.
        try {
            $this->doAutoCommitIfNeeded($repoBranchPath);
        } catch (\Throwable $e) {
            Log::error('Audit auto-commit failed unexpectedly', [
                'repoBranchPath' => $repoBranchPath,
                'class' => $e::class,
                'error' => $e->getMessage(),
            ]);
            error_log('[ZenEA] Auto-commit failed for ' . $repoBranchPath . ': ' . $e->getMessage());
        }
    }

    private function doAutoCommitIfNeeded(string $repoBranchPath): void
    {
        $logPath = $this->auditLogPath($repoBranchPath);

        if (! is_file($logPath)) {
            return;
        }

        $age = time() - @filemtime($logPath);
        if ($age < self::AUTO_COMMIT_AGE_SECONDS) {
            return;
        }

        $message = @file_get_contents($logPath);
        if ($message === false || trim($message) === '') {
            return;
        }

        $size = @filesize($logPath);
        if (is_int($size) && $size > self::LARGE_LOG_BYTES) {
            // The audit log is only removed after a successful commit+push, so a huge
            // file means auto-commit has been failing for a long time.
            Log::warning('Audit log is large; auto-commit is likely failing repeatedly', ['bytes' => $size]);
        }

        if (strlen($message) > self::MAX_COMMIT_MESSAGE_BYTES) {
            $message = substr($message, -self::MAX_COMMIT_MESSAGE_BYTES);
            $newline = strpos($message, "\n");
            $message = $newline === false ? $message : substr($message, $newline + 1);
            Log::warning('Audit commit message truncated', [
                'maxBytes' => self::MAX_COMMIT_MESSAGE_BYTES,
            ]);
        }

        try {
            $result = $this->gitService->commitAndPush($message, $repoBranchPath);
        } catch (\Throwable $e) {
            error_log('[ZenEA] Auto-commit failed for ' . $repoBranchPath . ': ' . $e->getMessage());
            return;
        }

        if (! $result['success']) {
            error_log('[ZenEA] Auto-commit failed for ' . $repoBranchPath . ': ' . ($result['message'] ?? 'unknown'));
            return;
        }

        @unlink($logPath);
    }

    /**
     * Derive the repo/branch base path from a type-specific data path.
     * E.g. /data/repo/branch/Application -> /data/repo/branch
     *      /data/repo/branch -> /data/repo/branch (unchanged)
     */
    public static function repoBranchPath(string $dataPath): string
    {
        // Walk up from the type directory to the repo/branch root.
        // The data path always has at least: /data/{repo}/{branch}[/{type}]
        $dataRoot = rtrim((string) config('data.path', base_path('../data')), DIRECTORY_SEPARATOR);

        // Strip any type subdirectory (one level above the repo/branch root)
        $normalized = rtrim($dataPath, DIRECTORY_SEPARATOR);
        $relative = str_replace($dataRoot . DIRECTORY_SEPARATOR, '', $normalized);
        $segments = explode(DIRECTORY_SEPARATOR, $relative);

        // We need at least 2 segments: repo/branch
        if (count($segments) < 2) {
            return $normalized;
        }

        return $dataRoot . DIRECTORY_SEPARATOR . $segments[0] . DIRECTORY_SEPARATOR . $segments[1];
    }

    private function auditLogPath(string $repoBranchPath): string
    {
        return $repoBranchPath . DIRECTORY_SEPARATOR . '.meta' . DIRECTORY_SEPARATOR . self::AUDIT_LOG_FILENAME;
    }
}
