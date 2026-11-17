<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Db\Transaction;
use UecTst\Db\Uuid7;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Belonging\BlgAuthContext;
use UecTst\Support\Time;

/**
 * 家族の管理（運用担当者の所属のみ。ApiSpec_Belonging.md 6.6〜6.8）。
 *   B27 すべての家族の一覧 GET /blg/families
 *   B28 家族の所属の解除 DELETE /blg/families/{familyId}/belonging（確認が必要）
 *   B29 家族の削除 DELETE /blg/families/{familyId}（確認が必要）
 */
final class BlgFamilyController extends BlgController
{
    /** B27 すべての家族の一覧（所属先の名前・ユーザの名前を含む。復旧コード・パスワードなどは含まない） */
    public function list(Request $request): Response
    {
        return $this->guarded($request, function (BlgAuthContext $c): Response {
            $families = array_map(static fn (array $f): array => [
                'id' => Uuid7::toString($f['id']),
                'createdAt' => Time::toIso($f['createdAt']),
                'belonging' => $f['belonging'] === null ? null : ['id' => Uuid7::toString($f['belonging']['id']), 'name' => $f['belonging']['name']],
                'joinedAt' => $f['joinedAt'] === null ? null : Time::toIso($f['joinedAt']),
                'users' => array_map(static fn (array $u): array => ['id' => Uuid7::toString($u['id']), 'name' => $u['name']], $f['users']),
            ], $this->services->families->listAll());
            return Response::json(200, ['families' => $families]);
        }, superOnly: true);
    }

    /** B28 所属の解除（確認が必要。家族は、個人ユーザになる。所属していない家族は 409 NOT_A_MEMBER） */
    public function release(Request $request, array $params): Response
    {
        return $this->guarded($request, function (BlgAuthContext $c) use ($params): Response {
            $this->requireElevation($c);
            $services = $this->services;
            $familyId = self::idParam($params, 'familyId') ?? throw ApiException::notFound('家族が見つかりません。');
            Transaction::run($services->pdo, function () use ($services, $familyId): void {
                $family = $services->families->lock($familyId) ?? throw ApiException::notFound('家族が見つかりません。');
                if ($family->belongingId === null) {
                    throw ApiException::conflict('NOT_A_MEMBER', 'この家族は、どこにも所属していません。');
                }
                $services->families->leaveBelonging($familyId);
            });
            $this->audit('family.release', $c->belongingId(), 'success', ['familyId' => Uuid7::toString($familyId)]);
            return Response::noContent();
        }, superOnly: true);
    }

    /** B29 家族の削除（確認が必要。退会（#21）と同じ。利用データは削除しない） */
    public function delete(Request $request, array $params): Response
    {
        return $this->guarded($request, function (BlgAuthContext $c) use ($params): Response {
            $this->requireElevation($c);
            $services = $this->services;
            $familyId = self::idParam($params, 'familyId') ?? throw ApiException::notFound('家族が見つかりません。');
            Transaction::run($services->pdo, function () use ($services, $familyId): void {
                $services->families->lock($familyId) ?? throw ApiException::notFound('家族が見つかりません。');
                // ON DELETE CASCADE で、ユーザ・パスキー・セッションが削除される。利用データは、外部キーを持たないため、そのまま残る。
                $services->families->delete($familyId);
            });
            $this->audit('family.delete', $c->belongingId(), 'success', ['familyId' => Uuid7::toString($familyId)]);
            return Response::noContent();
        }, superOnly: true);
    }
}
