<?php

declare(strict_types=1);

namespace UecTst\Tests\Unit\Security;

use PHPUnit\Framework\TestCase;
use RuntimeException;
use UecTst\Security\RecoveryCodeHasher;

final class RecoveryCodeHasherTest extends TestCase
{
    private function hasher(): RecoveryCodeHasher
    {
        return new RecoveryCodeHasher([1 => str_repeat('a', 32), 2 => str_repeat('b', 32)], 2);
    }

    public function testHmacSha256WithTheChosenKey(): void
    {
        $code = '7K3QMX9TPAH2W8RDF6NB4CJZ3';
        $this->assertSame(hash_hmac('sha256', $code, str_repeat('b', 32), true), $this->hasher()->hashWithCurrentKey($code));
        $this->assertSame(hash_hmac('sha256', $code, str_repeat('a', 32), true), $this->hasher()->hash($code, 1));
        $this->assertSame(32, strlen($this->hasher()->hashWithCurrentKey($code)));
        $this->assertSame(2, $this->hasher()->currentKeyId());
    }

    public function testDifferentKeysGiveDifferentHashes(): void
    {
        $all = $this->hasher()->hashWithAllKeys('7K3QMX9TPAH2W8RDF6NB4CJZ3');
        $this->assertSame([1, 2], array_keys($all));
        $this->assertNotSame($all[1], $all[2]);
    }

    public function testUnknownKeyIsRejected(): void
    {
        $this->expectException(RuntimeException::class);
        $this->hasher()->hash('x', 9);
    }

    public function testCurrentKeyMustExist(): void
    {
        $this->expectException(RuntimeException::class);
        new RecoveryCodeHasher([1 => 'k'], 5);
    }
}
