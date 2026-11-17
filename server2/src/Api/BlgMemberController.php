<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Db\Uuid7;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Belonging\BlgAuthContext;
use UecTst\Support\Time;

/**
 * 所属している家族の管理（ApiSpec_Belonging.md 5.）。
 *   B15 一覧 GET /blg/members
 *   B16 所属から外す DELETE /blg/members/{familyId}
 */
final class BlgMemberController extends BlgController
{
    /** B15 所属している家族の一覧（所属が参照できるのは、家族の ID・所属日時・ユーザの ID と名前だけ） */
    public function list(Request $request): Response
    {
        return $this->guarded($request, function (BlgAuthContext $c): Response {
            $families = array_map(static fn (array $f): array => [
                'id' => Uuid7::toString($f['id']),
                'joinedAt' => Time::toIso($f['joinedAt']),
                'users' => array_map(static fn (array $u): array => ['id' => Uuid7::toString($u['id']), 'name' => $u['name']], $f['users']),
            ], $this->services->belongings->members($c->belongingId()));
            return Response::json(200, ['families' => $families]);
        });
    }

    /** B16 所属している家族を外す（他の所属の家族・存在しない家族は、区別せず 404） */
    public function remove(Request $request, array $params): Response
    {
        return $this->guarded($request, function (BlgAuthContext $c) use ($params): Response {
            $familyId = self::idParam($params, 'familyId');
            if ($familyId === null || !$this->services->belongings->removeMember($c->belongingId(), $familyId)) {
                throw ApiException::notFound('家族が見つかりません。');
            }
            $this->audit('member.remove', $c->belongingId());
            return Response::noContent();
        });
    }
}
