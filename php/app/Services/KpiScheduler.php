<?php

namespace App\Services;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;

class KpiScheduler
{
    private int $debounceSeconds;

    public function __construct(
        private readonly DataPathResolver $dataPathResolver,
    ) {
        $this->debounceSeconds = config('kpi.debounce_seconds', 10);
    }

    public function markDirty(string $repoName, string $branch): void
    {
        $dir = $this->getMarkerDir($repoName, $branch);
        if (! File::isDirectory($dir)) {
            File::makeDirectory($dir, 0755, true);
        }
        $path = $dir . DIRECTORY_SEPARATOR . '.kpi_dirty';
        file_put_contents($path, (string) time(), LOCK_EX);
    }

    public function shouldCapture(string $repoName, string $branch): bool
    {
        $path = $this->getMarkerDir($repoName, $branch) . DIRECTORY_SEPARATOR . '.kpi_dirty';

        if (! is_file($path)) {
            return false;
        }

        $dirtyTime = (int) @file_get_contents($path);
        $elapsed = time() - $dirtyTime;

        Log::info('KpiScheduler shouldCapture', [
            'repo' => $repoName,
            'branch' => $branch,
            'dirtyTime' => $dirtyTime,
            'elapsed' => $elapsed,
            'threshold' => $this->debounceSeconds,
            'result' => $elapsed >= $this->debounceSeconds,
        ]);

        return $elapsed >= $this->debounceSeconds;
    }

    public function clearDirty(string $repoName, string $branch): void
    {
        $path = $this->getMarkerDir($repoName, $branch) . DIRECTORY_SEPARATOR . '.kpi_dirty';
        if (is_file($path)) {
            @unlink($path);
        }
    }

    private function getMarkerDir(string $repoName, string $branch): string
    {
        return $this->dataPathResolver->resolve($repoName, $branch, null) . DIRECTORY_SEPARATOR . '.meta';
    }
}
