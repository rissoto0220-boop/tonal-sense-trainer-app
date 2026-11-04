<?php

declare(strict_types=1);

namespace UecTst\Tests\Support;

use UecTst\Security\Base64Url;

/**
 * テスト用の、ソフトウェアのパスキー認証器（ES256）。ブラウザの navigator.credentials.create / get が返す
 * PublicKeyCredential（toJSON の形式）を作る。
 */
final class SoftwareAuthenticator
{
    public string $credentialId;
    public int $counter = 0;
    public bool $userVerified = true;
    public bool $backupEligible = false;
    public string $origin;
    public string $rpId;
    private \OpenSSLAsymmetricKey $key;
    private string $userHandle = '';

    public function __construct(string $rpId = 'localhost', string $origin = TestClient::ORIGIN)
    {
        $this->rpId = $rpId;
        $this->origin = $origin;
        $this->credentialId = random_bytes(32);
        $key = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        if ($key === false) {
            throw new \RuntimeException('EC 鍵を作れません');
        }
        $this->key = $key;
    }

    /**
     * @param array<string, mixed> $options /superuser/passkeys/registration-options のレスポンス
     * @return array<string, mixed>
     */
    public function create(array $options, ?string $challengeOverride = null): array
    {
        $this->userHandle = (string) Base64Url::decode($options['user']['id']);
        $clientData = json_encode([
            'type' => 'webauthn.create',
            'challenge' => $challengeOverride ?? $options['challenge'],
            'origin' => $this->origin,
            'crossOrigin' => false,
        ], JSON_THROW_ON_ERROR);

        $details = openssl_pkey_get_details($this->key);
        $cose = Cbor::encode([
            1 => 2,
            3 => -7,
            -1 => 1,
            -2 => new CborBytes(str_pad($details['ec']['x'], 32, "\0", STR_PAD_LEFT)),
            -3 => new CborBytes(str_pad($details['ec']['y'], 32, "\0", STR_PAD_LEFT)),
        ]);
        $authData = hash('sha256', $this->rpId, true)
            . chr($this->flags(attested: true))
            . pack('N', $this->counter)
            . str_repeat("\0", 16)
            . pack('n', strlen($this->credentialId))
            . $this->credentialId
            . $cose;
        $attestationObject = Cbor::encode(['fmt' => 'none', 'attStmt' => new \stdClass(), 'authData' => new CborBytes($authData)]);

        return [
            'id' => Base64Url::encode($this->credentialId),
            'rawId' => Base64Url::encode($this->credentialId),
            'type' => 'public-key',
            'authenticatorAttachment' => 'platform',
            'clientExtensionResults' => new \stdClass(),
            'response' => [
                'clientDataJSON' => Base64Url::encode($clientData),
                'attestationObject' => Base64Url::encode($attestationObject),
                'transports' => ['internal', 'hybrid'],
            ],
        ];
    }

    /**
     * @param array<string, mixed> $options /elevation/passkey-options のレスポンス
     * @return array<string, mixed>
     */
    public function get(array $options, ?string $challengeOverride = null): array
    {
        $this->counter++;
        $clientData = json_encode([
            'type' => 'webauthn.get',
            'challenge' => $challengeOverride ?? $options['challenge'],
            'origin' => $this->origin,
            'crossOrigin' => false,
        ], JSON_THROW_ON_ERROR);
        $authData = hash('sha256', $this->rpId, true) . chr($this->flags(attested: false)) . pack('N', $this->counter);
        openssl_sign($authData . hash('sha256', $clientData, true), $signature, $this->key, OPENSSL_ALGO_SHA256);

        return [
            'id' => Base64Url::encode($this->credentialId),
            'rawId' => Base64Url::encode($this->credentialId),
            'type' => 'public-key',
            'authenticatorAttachment' => 'platform',
            'clientExtensionResults' => new \stdClass(),
            'response' => [
                'clientDataJSON' => Base64Url::encode($clientData),
                'authenticatorData' => Base64Url::encode($authData),
                'signature' => Base64Url::encode($signature),
                'userHandle' => Base64Url::encode($this->userHandle),
            ],
        ];
    }

    private function flags(bool $attested): int
    {
        $flags = 0x01; // UP
        if ($this->userVerified) {
            $flags |= 0x04;
        }
        if ($this->backupEligible) {
            $flags |= 0x08;
        }
        if ($attested) {
            $flags |= 0x40;
        }
        return $flags;
    }
}
