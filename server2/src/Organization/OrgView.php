<?php

declare(strict_types=1);

namespace UecTst\Organization;

use UecTst\Db\Uuid7;

/** API が返す、組織の形（ApiSpec_Organization.md 0.8）。 */
final class OrgView
{
    /** @return array{id: string, name: string, loginId: string, isSuper: bool, passwordChangeRequired: bool} */
    public static function organization(OrganizationRecord $o): array
    {
        return [
            'id' => Uuid7::toString($o->id),
            'name' => $o->name,
            'loginId' => $o->loginId,
            'isSuper' => $o->isSuper,
            'passwordChangeRequired' => $o->passwordChangeRequired,
        ];
    }
}
