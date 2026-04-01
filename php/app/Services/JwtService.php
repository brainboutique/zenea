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

class JwtService
{
    private const ALGORITHM = 'HS256';
    private const DEFAULT_EXPIRY_SECONDS = 3600;

    private function getSecret(): string
    {
        $secret = config('auth.jwt_secret', '');
        if ($secret === '') {
            throw new \RuntimeException('JWT_SECRET is required when AUTHENTICATION=Local');
        }
        return $secret;
    }

    public function sign(array $payload, ?int $expirySeconds = null): string
    {
        $secret = $this->getSecret();
        $expiry = $expirySeconds ?? self::DEFAULT_EXPIRY_SECONDS;

        $header = [
            'alg' => self::ALGORITHM,
            'typ' => 'JWT',
        ];

        $payload['iat'] = time();
        $payload['exp'] = time() + $expiry;

        $headerEncoded = $this->base64UrlEncode(json_encode($header, JSON_UNESCAPED_SLASHES));
        $payloadEncoded = $this->base64UrlEncode(json_encode($payload, JSON_UNESCAPED_SLASHES));

        $signature = hash_hmac('sha256', "$headerEncoded.$payloadEncoded", $secret, true);
        $signatureEncoded = $this->base64UrlEncode($signature);

        return "$headerEncoded.$payloadEncoded.$signatureEncoded";
    }

    public function verify(string $token): ?array
    {
        $secret = $this->getSecret();
        $parts = explode('.', $token);

        if (count($parts) !== 3) {
            return null;
        }

        [$headerEncoded, $payloadEncoded, $signatureEncoded] = $parts;

        $expectedSignature = $this->base64UrlEncode(
            hash_hmac('sha256', "$headerEncoded.$payloadEncoded", $secret, true)
        );

        if (! hash_equals($expectedSignature, $signatureEncoded)) {
            return null;
        }

        $payloadJson = $this->base64UrlDecode($payloadEncoded);
        $payload = json_decode($payloadJson, true);

        if (! is_array($payload)) {
            return null;
        }

        if (isset($payload['exp']) && $payload['exp'] < time()) {
            return null;
        }

        return $payload;
    }

    public function getExpirySeconds(): int
    {
        return (int) config('auth.jwt_expiry_seconds', self::DEFAULT_EXPIRY_SECONDS);
    }

    private function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $data): string
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }

        return base64_decode(strtr($data, '-_', '+/'));
    }
}
