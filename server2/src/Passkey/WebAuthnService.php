<?php

declare(strict_types=1);

namespace UecTst\Passkey;

use Symfony\Component\Serializer\SerializerInterface;
use Symfony\Component\Uid\Uuid;
use Throwable;
use UecTst\Config\AppConfig;
use UecTst\Http\ApiException;
use UecTst\Security\Base64Url;
use Webauthn\AttestationStatement\AttestationStatementSupportManager;
use Webauthn\AttestationStatement\NoneAttestationStatementSupport;
use Webauthn\AuthenticatorAssertionResponse;
use Webauthn\AuthenticatorAssertionResponseValidator;
use Webauthn\AuthenticatorAttestationResponse;
use Webauthn\AuthenticatorAttestationResponseValidator;
use Webauthn\AuthenticatorSelectionCriteria;
use Webauthn\CeremonyStep\CeremonyStepManagerFactory;
use Webauthn\CredentialRecord;
use Webauthn\Denormalizer\WebauthnSerializerFactory;
use Webauthn\PublicKeyCredential;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialDescriptor;
use Webauthn\PublicKeyCredentialParameters;
use Webauthn\PublicKeyCredentialRequestOptions;
use Webauthn\PublicKeyCredentialRpEntity;
use Webauthn\PublicKeyCredentialUserEntity;
use Webauthn\TrustPath\EmptyTrustPath;

/**
 * WebAuthn（パスキー）の発行と検証。ライブラリ（web-auth/webauthn-lib）を包み、API の形式（JSON）と、
 * 失敗時のエラー（401 PASSKEY_VERIFICATION_FAILED）にそろえる。
 *
 * 検証する内容: challenge・オリジン（allowedOrigins）・RP ID のハッシュ・ユーザ検証（UV）・署名・署名カウンタ。
 * 認証器の機種の証明（attestation）は求めない（none のみ）。
 */
final class WebAuthnService
{
    public const TIMEOUT_MS = 300000;
    /** ES256、RS256 */
    private const ALGORITHMS = [-7, -257];

    private ?SerializerInterface $serializer = null;

    public function __construct(private readonly AppConfig $config)
    {
    }

    /**
     * 登録の開始（navigator.credentials.create に渡す形式）。
     *
     * @param list<PasskeyRecord> $existing 登録済みのパスキー（二重登録を防ぐ）
     * @return array<string, mixed>
     */
    public function registrationOptions(string $familyId, string $challenge, array $existing): array
    {
        return [
            'challenge' => Base64Url::encode($challenge),
            'rp' => ['id' => $this->config->webauthnRpId, 'name' => $this->config->webauthnRpName],
            'user' => ['id' => Base64Url::encode($familyId), 'name' => '家族の管理用', 'displayName' => '家族の管理用'],
            'pubKeyCredParams' => array_map(static fn (int $alg): array => ['type' => 'public-key', 'alg' => $alg], self::ALGORITHMS),
            'timeout' => self::TIMEOUT_MS,
            'attestation' => 'none',
            'authenticatorSelection' => ['residentKey' => 'preferred', 'userVerification' => 'required'],
            'excludeCredentials' => array_map(
                static fn (PasskeyRecord $p): array => ['type' => 'public-key', 'id' => Base64Url::encode($p->credentialId)],
                $existing,
            ),
        ];
    }

    /**
     * 確認の開始（navigator.credentials.get に渡す形式）。
     *
     * @param list<PasskeyRecord> $passkeys
     * @return array<string, mixed>
     */
    public function requestOptions(string $challenge, array $passkeys): array
    {
        return [
            'challenge' => Base64Url::encode($challenge),
            'rpId' => $this->config->webauthnRpId,
            'timeout' => self::TIMEOUT_MS,
            'userVerification' => 'required',
            'allowCredentials' => array_map(static function (PasskeyRecord $p): array {
                $entry = ['type' => 'public-key', 'id' => Base64Url::encode($p->credentialId)];
                if ($p->transports !== []) {
                    $entry['transports'] = $p->transports;
                }
                return $entry;
            }, $passkeys),
        ];
    }

    /** 確認の応答のクレデンシャル ID（バイナリ）。読み取れなければ null。 */
    public function credentialIdOf(mixed $credential): ?string
    {
        if (!is_array($credential) || !is_string($credential['rawId'] ?? null)) {
            return null;
        }
        return Base64Url::decode($credential['rawId']);
    }

    /**
     * 登録の応答を検証する。
     *
     * @param array<string, mixed> $credential navigator.credentials.create() の結果（toJSON）
     * @throws ApiException 401 PASSKEY_VERIFICATION_FAILED
     */
    public function verifyRegistration(array $credential, string $challenge, string $familyId): VerifiedRegistration
    {
        try {
            $parsed = $this->parse($credential);
            $response = $parsed->response;
            if (!$response instanceof AuthenticatorAttestationResponse) {
                throw ApiException::passkeyVerificationFailed();
            }

            $options = PublicKeyCredentialCreationOptions::create(
                PublicKeyCredentialRpEntity::create($this->config->webauthnRpName, $this->config->webauthnRpId),
                PublicKeyCredentialUserEntity::create('家族の管理用', $familyId, '家族の管理用'),
                $challenge,
                array_map(static fn (int $alg): PublicKeyCredentialParameters => PublicKeyCredentialParameters::createPk($alg), self::ALGORITHMS),
                AuthenticatorSelectionCriteria::create(userVerification: AuthenticatorSelectionCriteria::USER_VERIFICATION_REQUIREMENT_REQUIRED),
                'none',
                [],
                self::TIMEOUT_MS,
            );
            $validator = AuthenticatorAttestationResponseValidator::create($this->factory()->creationCeremony());
            $record = $validator->check($response, $options, $this->config->webauthnRpId);
            $transports = array_values(array_filter(
                $response->transports ?? [],
                static fn (mixed $t): bool => is_string($t) && preg_match('/^[a-z-]{1,20}$/', $t) === 1,
            ));
            return new VerifiedRegistration(
                $record->publicKeyCredentialId,
                $record->credentialPublicKey,
                $record->counter,
                $transports,
                $record->backupEligible === true,
            );
        } catch (ApiException $e) {
            throw $e;
        } catch (Throwable) {
            throw ApiException::passkeyVerificationFailed();
        }
    }

    /**
     * 確認の応答を検証する。
     *
     * @param array<string, mixed> $credential navigator.credentials.get() の結果（toJSON）
     * @param list<PasskeyRecord> $familyPasskeys 家族のパスキーすべて（allowCredentials と同じ）
     * @return int 新しい署名カウンタ
     * @throws ApiException 401 PASSKEY_VERIFICATION_FAILED
     */
    public function verifyAssertion(array $credential, string $challenge, PasskeyRecord $stored, array $familyPasskeys): int
    {
        try {
            $parsed = $this->parse($credential);
            $response = $parsed->response;
            if (!$response instanceof AuthenticatorAssertionResponse) {
                throw ApiException::passkeyVerificationFailed();
            }

            $options = PublicKeyCredentialRequestOptions::create(
                $challenge,
                $this->config->webauthnRpId,
                array_map(
                    static fn (PasskeyRecord $p): PublicKeyCredentialDescriptor => PublicKeyCredentialDescriptor::create('public-key', $p->credentialId, $p->transports),
                    $familyPasskeys,
                ),
                PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_REQUIRED,
                self::TIMEOUT_MS,
            );
            $record = new CredentialRecord(
                $stored->credentialId,
                'public-key',
                $stored->transports,
                'none',
                EmptyTrustPath::create(),
                Uuid::fromString('00000000-0000-0000-0000-000000000000'),
                $stored->publicKey,
                $stored->familyId,
                $stored->signCount,
                null,
                $stored->backupEligible,
                null,
                true,
            );
            $validator = AuthenticatorAssertionResponseValidator::create($this->factory()->requestCeremony());
            $updated = $validator->check($record, $response, $options, $this->config->webauthnRpId, $stored->familyId);
            return $updated->counter;
        } catch (ApiException $e) {
            throw $e;
        } catch (Throwable) {
            throw ApiException::passkeyVerificationFailed();
        }
    }

    private function factory(): CeremonyStepManagerFactory
    {
        $factory = new CeremonyStepManagerFactory();
        $factory->setAllowedOrigins($this->config->allowedOrigins);
        return $factory;
    }

    /** @param array<string, mixed> $credential */
    private function parse(array $credential): PublicKeyCredential
    {
        $this->serializer ??= (new WebauthnSerializerFactory(
            new AttestationStatementSupportManager([new NoneAttestationStatementSupport()]),
        ))->create();
        $parsed = $this->serializer->deserialize(json_encode($credential, JSON_THROW_ON_ERROR), PublicKeyCredential::class, 'json');
        if (!$parsed instanceof PublicKeyCredential) {
            throw ApiException::passkeyVerificationFailed();
        }
        return $parsed;
    }
}
