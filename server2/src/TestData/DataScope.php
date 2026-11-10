<?php

declare(strict_types=1);

namespace UecTst\TestData;

/**
 * 利用データを参照できる範囲（TableSpec_TestData.md 10.、TableSpec_Organization.md 6.）。
 * test_sessions を別名 s で参照する FROM 句と WHERE 句の部品を返す。参照の可否は、リクエストのたびに、現在の所属で判定する。
 */
final class DataScope
{
    private function __construct(
        private readonly string $from,
        private readonly string $where,
        /** @var list<string> */
        private readonly array $params,
    ) {
    }

    /** 1人のユーザ（家族の API。呼び出し側が、そのユーザが家族に属することを確認済みであること）。 */
    public static function user(string $userId): self
    {
        return new self('test_sessions s', 's.user_id = ?', [$userId]);
    }

    /** 現在その組織に所属している家族の、現存するユーザ。 */
    public static function organization(string $organizationId): self
    {
        return new self(
            'test_sessions s JOIN users u ON u.id = s.user_id JOIN families f ON f.id = u.family_id',
            'f.organization_id = ?',
            [$organizationId],
        );
    }

    /** 運用担当者: すべて（個人ユーザ・退会した家族・削除されたユーザのデータを含む）。 */
    public static function all(): self
    {
        return new self('test_sessions s', '1 = 1', []);
    }

    public function from(): string
    {
        return $this->from;
    }

    public function where(): string
    {
        return $this->where;
    }

    /** @return list<string> */
    public function params(): array
    {
        return $this->params;
    }
}
