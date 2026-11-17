<?php

declare(strict_types=1);

namespace UecTst\Belonging;

use UecTst\Db\Uuid7;

/** API が返す、所属の形（ApiSpec_Belonging.md 0.8）。 */
final class BlgView
{
    /** @return array{id: string, name: string, nameKana: string|null, loginId: string, isSuper: bool, passwordChangeRequired: bool} */
    public static function belonging(BelongingRecord $o): array
    {
        return [
            'id' => Uuid7::toString($o->id),
            'name' => $o->name,
            'nameKana' => $o->nameKana,
            'loginId' => $o->loginId,
            'isSuper' => $o->isSuper,
            'passwordChangeRequired' => $o->passwordChangeRequired,
        ];
    }
}
