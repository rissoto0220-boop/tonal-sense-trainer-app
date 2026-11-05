<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Db\Uuid7;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Organization\OrgAuthContext;
use UecTst\Support\Time;

/**
 * 所属している家族の管理（ApiSpec_Organization.md 5.）。
 *   O15 一覧 GET /org/members
 *   O16 所属から外す DELETE /org/members/{familyId}
 */
final class OrgMemberController extends OrgController
{
    /** O15 所属している家族の一覧（組織が参照できるのは、家族の ID・所属日時・ユーザの ID と名前だけ） */
    public function list(Request $request): Response
    {
        return $this->guarded($request, function (OrgAuthContext $c): Response {
            $families = array_map(static fn (array $f): array => [
                'id' => Uuid7::toString($f['id']),
                'joinedAt' => Time::toIso($f['joinedAt']),
                'users' => array_map(static fn (array $u): array => ['id' => Uuid7::toString($u['id']), 'name' => $u['name']], $f['users']),
            ], $this->services->organizations->members($c->organizationId()));
            return Response::json(200, ['families' => $families]);
        });
    }

    /** O16 所属している家族を外す（他の組織の家族・存在しない家族は、区別せず 404） */
    public function remove(Request $request, array $params): Response
    {
        return $this->guarded($request, function (OrgAuthContext $c) use ($params): Response {
            $familyId = self::idParam($params, 'familyId');
            if ($familyId === null || !$this->services->organizations->removeMember($c->organizationId(), $familyId)) {
                throw ApiException::notFound('家族が見つかりません。');
            }
            $this->audit('member.remove', $c->organizationId());
            return Response::noContent();
        });
    }
}
