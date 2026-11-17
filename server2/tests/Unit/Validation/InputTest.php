<?php

declare(strict_types=1);

namespace UecTst\Tests\Unit\Validation;

use PHPUnit\Framework\TestCase;
use UecTst\Validation\Input;

final class InputTest extends TestCase
{
    public function testEmail(): void
    {
        foreach (['user@example.com', 'a.b+c@sub.example.co.jp'] as $ok) {
            $this->assertNull(Input::emailError($ok), $ok);
        }
        foreach (['', 'plain', '@example.com', 'a@', 'a b@example.com', str_repeat('a', 250) . '@e.com'] as $bad) {
            $this->assertSame('INVALID_FORMAT', Input::emailError($bad), $bad);
        }
    }

    public function testBelongingName(): void
    {
        $this->assertNull(Input::belongingNameError(str_repeat('あ', 100)));
        $this->assertSame('TOO_LONG', Input::belongingNameError(str_repeat('あ', 101)));
        $this->assertSame('REQUIRED', Input::belongingNameError(''));
        $this->assertSame('INVALID_CHARACTER', Input::belongingNameError("a
b"));
        $this->assertSame('○○大学', Input::normalizeText("\u{3000}○○大学 "));
    }

    public function testLoginId(): void
    {
        foreach (['abcd', 'a.b_c-d', str_repeat('z', 64), '0123'] as $ok) {
            $this->assertNull(Input::loginIdError($ok), $ok);
        }
        $this->assertSame('TOO_SHORT', Input::loginIdError('abc'));
        $this->assertSame('TOO_SHORT', Input::loginIdError(''));
        $this->assertSame('TOO_LONG', Input::loginIdError(str_repeat('a', 65)));
        foreach (['ABCD', 'ab cd', 'ab@cd', 'ユーザー', "ab
cd"] as $bad) {
            $this->assertSame('INVALID_CHARACTER', Input::loginIdError($bad), $bad);
        }
    }

    public function testUserNameIsTrimmedIncludingFullWidthSpaces(): void
    {
        $this->assertSame('はなこ', Input::normalizeUserName("  \u{3000}はなこ\u{3000} "));
        $this->assertSame('a b', Input::normalizeUserName(' a b '), '内側の空白は残す');
        $this->assertSame('', Input::normalizeUserName("\u{3000} \t"));
    }

    public function testUserNameIsNormalizedToNfc(): void
    {
        $decomposed = "か\u{3099}"; // か + 濁点
        $this->assertSame("\u{304C}", Input::normalizeUserName($decomposed)); // が
    }

    public function testUserNameLengthIsCountedInCharacters(): void
    {
        $this->assertNull(Input::userNameError(str_repeat('あ', 20)));
        $this->assertSame('TOO_LONG', Input::userNameError(str_repeat('あ', 21)));
        $this->assertNull(Input::userNameError(str_repeat('😀', 20)), '絵文字も1文字');
        $this->assertSame('REQUIRED', Input::userNameError(''));
    }

    public function testUserNameRejectsControlCharacters(): void
    {
        foreach (["a\nb", "a\x00b", "a\u{200B}b" /* ゼロ幅スペース（書式文字） */, "a\tb"] as $bad) {
            $this->assertSame('INVALID_CHARACTER', Input::userNameError($bad), bin2hex($bad));
        }
    }
}
