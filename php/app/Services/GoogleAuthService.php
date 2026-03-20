<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

class GoogleAuthService
{
    private const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo?id_token=%s';

    /**
     * Whether Google OAuth is configured (enforced).
     */
    public function isEnabled(): bool
    {
        $clientId = config('google.client_id', '');
        $clientSecret = config('google.client_secret', '');

        return $clientId !== '' && $clientSecret !== '';
    }

    /**
     * Verify a Google ID token and return payload (email, sub) or null if invalid.
     */
    public function verifyIdToken(string $idToken): ?array
    {
        $response = Http::get(sprintf(self::TOKENINFO_URL, $idToken));

        if (! $response->successful()) {
            return null;
        }

        $payload = $response->json();
        if (! is_array($payload) || empty($payload['email'])) {
            return null;
        }

        $clientId = config('google.client_id');
        if (isset($payload['aud']) && $payload['aud'] !== $clientId) {
            return null;
        }

        return $payload;
    }

    /**
     * Path to /data/.auth.json (permissions by email).
     */
    public function getAuthFilePath(): string
    {
        $dataPath = rtrim((string) config('data.path', base_path('../data')), \DIRECTORY_SEPARATOR);

        return $dataPath . \DIRECTORY_SEPARATOR . '.auth.json';
    }

    /**
     * Check if the given email has access. If .auth.json does not exist, allow all.
     * If it exists, require an entry for the email with "access" === true.
     */
    public function hasAccess(string $email): bool
    {
        $path = $this->getAuthFilePath();
        if (! is_file($path)) {
            return true;
        }

        $json = @file_get_contents($path);
        if ($json === false) {
            return false;
        }

        $data = json_decode($json, true);
        if (! is_array($data)) {
            return false;
        }

        $email = strtolower(trim($email));
        if (! isset($data[$email]) || ! is_array($data[$email])) {
            return false;
        }

        return isset($data[$email]['access']) && $data[$email]['access'] === true;
    }

    /**
     * Exchange authorization code for tokens. Returns id_token or null on failure.
     */
    public function exchangeCodeForTokens(string $code, string $redirectUri): ?array
    {
        $response = Http::asForm()->post('https://oauth2.googleapis.com/token', [
            'code' => $code,
            'client_id' => config('google.client_id'),
            'client_secret' => config('google.client_secret'),
            'redirect_uri' => $redirectUri,
            'grant_type' => 'authorization_code',
        ]);

        if (! $response->successful()) {
            return null;
        }

        $body = $response->json();
        if (! is_array($body) || empty($body['id_token'])) {
            return null;
        }

        return $body;
    }
}
