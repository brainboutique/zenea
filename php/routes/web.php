<?php

use Illuminate\Support\Facades\Route;

// Serve Angular SPA (built into public/index.html) for all non-API routes.
// API endpoints live under routes/api.php (prefixed with /api/v1).
// Static assets (JS, CSS, etc.) must be served with correct MIME types; if the web server
// sends every request here (e.g. nginx without try_files), serve existing files from public/.
Route::get('/{any?}', function (string $any = '') {
    $path = $any === '' ? 'index.html' : $any;

    // Exclude static file extensions - these should be served directly by web server
    // This prevents Laravel from intercepting requests for JS/CSS/image files
    $staticExtensions = ['js', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'eot', 'json', 'map', 'webp', 'avif'];
    $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));

    if (in_array($extension, $staticExtensions)) {
        // For static files, check if file exists and serve it with proper MIME type
        // Use both realpath and direct file_exists for robustness
        $fullPath = public_path($path);
        $resolvedPath = realpath($fullPath);
        $publicRoot = realpath(public_path());

        // Check if file exists and is within public directory (prevent path traversal)
        if (
            file_exists($fullPath)
            && is_file($fullPath)
            && $resolvedPath !== false
            && $publicRoot !== false
            && str_starts_with($resolvedPath, $publicRoot . DIRECTORY_SEPARATOR)
        ) {
            return response()->file($resolvedPath);
        }

        // If static file doesn't exist, return 404 instead of falling back to index.html
        // This prevents serving HTML content for JS files, which causes MIME type errors
        abort(404);
    }

    // For non-static files (SPA routes), serve index.html
    // Set cache control headers to prevent server-side caching
    $spaIndex = public_path('index.html');
    if (file_exists($spaIndex)) {
        return response()->file($spaIndex,[
            'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma' => 'no-cache',
            'Expires' => '0',
        ]);
    }

    // Fallback for local dev when Angular isn't built into /public yet.
    return view('welcome');
})->where('any', '^(?!api).*$');
