<?php

use Illuminate\Http\Request;

// Prevent PHP errors/warnings/deprecations from being sent to the response (API must return clean JSON only).
ini_set('display_errors', '0');

define('LARAVEL_START', microtime(true));

// Log bootstrap errors when Laravel is not yet running (e.g. missing .env, vendor, or unwritable storage)
$bootstrapErrorLog = __DIR__ . '/../storage/logs/bootstrap-error.log';
set_error_handler(function ($severity, $message, $file, $line) use ($bootstrapErrorLog) {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    $s = date('c') . ' [' . $severity . '] ' . $message . ' in ' . $file . ':' . $line . "\n";
    if (is_dir(dirname($bootstrapErrorLog)) && is_writable(dirname($bootstrapErrorLog))) {
        @file_put_contents($bootstrapErrorLog, $s, FILE_APPEND | LOCK_EX);
    }
    // Suppress output for deprecations (e.g. PDO::MYSQL_ATTR_SSL_CA in vendor or config) so API response stays clean.
    if ($severity === E_DEPRECATED || $severity === E_USER_DEPRECATED) {
        return true;
    }
    return false;
});

// Determine if the application is in maintenance mode...
if (file_exists($maintenance = __DIR__.'/../storage/framework/maintenance.php')) {
    require $maintenance;
}

// Register the Composer autoloader...
require __DIR__.'/../vendor/autoload.php';

// Bootstrap Laravel and handle the request...
try {
    (require_once __DIR__.'/../bootstrap/app.php')
        ->handleRequest(Request::capture());
} catch (Throwable $e) {
    $s = date('c') . ' ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine() . "\n" . $e->getTraceAsString() . "\n";
    if (is_dir(dirname($bootstrapErrorLog)) && is_writable(dirname($bootstrapErrorLog))) {
        @file_put_contents($bootstrapErrorLog, $s, FILE_APPEND | LOCK_EX);
    }
    throw $e;
}
