<?php

declare(strict_types=1);

namespace UecTst\Organization;

/** 認証済みの、組織のリクエストの文脈。 */
final class OrgAuthContext
{
    public function __construct(
        public readonly OrgSession $session,
        public readonly OrganizationRecord $organization,
    ) {
    }

    public function organizationId(): string
    {
        return $this->organization->id;
    }
}
