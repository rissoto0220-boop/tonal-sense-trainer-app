<?php

declare(strict_types=1);

namespace UecTst\Captcha;

use Closure;

/**
 * Cloudflare Turnstile のサーバ側の検証。
 * トークンを、秘密鍵とともに siteverify に送り、success が true なら成功とする。
 * 通信の失敗・応答の不備は、失敗として扱う（安全側）。
 */
final class TurnstileVerifier implements CaptchaVerifier
{
    private const ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    private const MAX_TOKEN_LENGTH = 2048;

    /** @var Closure(string, array<string, string>): ?string */
    private readonly Closure $post;

    /**
     * @param (callable(string, array<string, string>): ?string)|null $post テスト用に、HTTP の POST を差し替える。(URL, フォーム項目) => 応答の本文。失敗は null
     */
    public function __construct(private readonly string $secretKey, ?callable $post = null)
    {
        $this->post = $post !== null ? Closure::fromCallable($post) : self::curlPost(...);
    }

    public function verify(?string $token, string $clientIp): bool
    {
        if ($token === null || $token === '' || strlen($token) > self::MAX_TOKEN_LENGTH) {
            return false;
        }
        $body = ($this->post)(self::ENDPOINT, ['secret' => $this->secretKey, 'response' => $token, 'remoteip' => $clientIp]);
        if ($body === null) {
            return false;
        }
        $data = json_decode($body, true);
        return is_array($data) && ($data['success'] ?? false) === true;
    }

    /** @param array<string, string> $fields */
    private static function curlPost(string $url, array $fields): ?string
    {
        $curl = curl_init($url);
        if ($curl === false) {
            return null;
        }
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query($fields),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 5,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);
        $response = curl_exec($curl);
        $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        curl_close($curl);
        return (is_string($response) && $status === 200) ? $response : null;
    }
}
