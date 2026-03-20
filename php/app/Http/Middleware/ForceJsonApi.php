<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Ensure API routes always receive JSON responses (validation errors, exceptions, etc.)
 * by making the request expect JSON when the proxy or client omits Accept header.
 */
class ForceJsonApi
{
    public function handle(Request $request, Closure $next): Response
    {
        $request->headers->set('Accept', 'application/json');

        return $next($request);
    }
}
