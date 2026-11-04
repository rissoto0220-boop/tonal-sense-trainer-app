<?php

declare(strict_types=1);

namespace UecTst\Tests\Unit\Security;

use PHPUnit\Framework\TestCase;
use UecTst\Security\Tokens;

final class TokensTest extends TestCase
{
    public function testGeneratedTokenIs256BitBase64Url(): void
    {
        $token = Tokens::generate();
        $this->assertSame(43, strlen($token));
        $this->assertTrue(Tokens::isWellFormed($token));
        $this->assertSame(32, strlen(base64_decode(strtr($token, '-_', '+/') . '=', true)));
    }

    public function testTokensAreUnique(): void
    {
        $seen = [];
        for ($i = 0; $i < 2000; $i++) {
            $seen[Tokens::generate()] = true;
        }
        $this->assertCount(2000, $seen);
    }

    public function testHashIsSha256Binary(): void
    {
        $this->assertSame(hash('sha256', 'abc', true), Tokens::hash('abc'));
        $this->assertSame(32, strlen(Tokens::hash('abc')));
    }

    public function testMalformedTokensAreDetected(): void
    {
        foreach (['', 'short', str_repeat('a', 42), str_repeat('a', 44), str_repeat('+', 43), str_repeat('a', 42) . ' '] as $bad) {
            $this->assertFalse(Tokens::isWellFormed($bad), $bad);
        }
    }
}
