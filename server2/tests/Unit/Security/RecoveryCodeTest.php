<?php

declare(strict_types=1);

namespace UecTst\Tests\Unit\Security;

use PHPUnit\Framework\TestCase;
use UecTst\Security\RecoveryCode as R;

final class RecoveryCodeTest extends TestCase
{
    public function testCheckCharacterMatchesTheSpecExamples(): void
    {
        // ApiSpec_Auth.md 0.6 の例
        $this->assertSame('3', R::checkCharacter('7K3QMX9TPAH2W8RDF6NB4CJZ'));
        $this->assertSame('1', R::checkCharacter('M8RQ2ZT4KDW7HXA9CNPF3BJE'));
        $this->assertSame('7K3QM-X9TPA-H2W8R-DF6NB-4CJZ3', R::format('7K3QMX9TPAH2W8RDF6NB4CJZ3'));
        $this->assertNull(R::validate('7K3QMX9TPAH2W8RDF6NB4CJZ3'));
        $this->assertNull(R::validate('M8RQ2ZT4KDW7HXA9CNPF3BJE1'));
    }

    public function testGeneratedCodesAreValidWithTheRightShape(): void
    {
        $seen = [];
        for ($i = 0; $i < 500; $i++) {
            $code = R::generate();
            $this->assertSame(25, strlen($code));
            $this->assertMatchesRegularExpression('/^[0-9A-HJKMNP-TV-Z]{25}$/', $code);
            $this->assertNull(R::validate($code));
            $seen[$code] = true;
            $this->assertMatchesRegularExpression('/^([0-9A-Z]{5}-){4}[0-9A-Z]{5}$/', R::format($code));
        }
        $this->assertCount(500, $seen, '重複しない');
    }

    public function testEverySingleCharacterErrorIsDetected(): void
    {
        $code = '7K3QMX9TPAH2W8RDF6NB4CJZ3';
        $missed = 0;
        for ($i = 0; $i < 25; $i++) {
            foreach (str_split(R::ALPHABET) as $other) {
                if ($other === $code[$i]) {
                    continue;
                }
                $mutated = substr($code, 0, $i) . $other . substr($code, $i + 1);
                if (R::validate($mutated) === null) {
                    $missed++;
                }
            }
        }
        $this->assertSame(0, $missed, '1文字の打ち間違いは、すべて検出できる');
    }

    public function testAdjacentSwapsAreAlmostAlwaysDetected(): void
    {
        $total = 0;
        $missed = 0;
        for ($n = 0; $n < 200; $n++) {
            $code = R::generate();
            for ($i = 0; $i < 24; $i++) {
                if ($code[$i] === $code[$i + 1]) {
                    continue;
                }
                $total++;
                $swapped = substr($code, 0, $i) . $code[$i + 1] . $code[$i] . substr($code, $i + 2);
                if (R::validate($swapped) === null) {
                    $missed++;
                }
            }
        }
        $this->assertLessThan(0.05, $missed / $total, "隣り合う2文字の入れ替えの見逃し: {$missed}/{$total}");
    }

    public function testNormalizeAcceptsHandwritingAndWidthVariants(): void
    {
        $expected = '7K3QMX9TPAH2W8RDF6NB4CJZ3';
        foreach ([
            '7K3QM-X9TPA-H2W8R-DF6NB-4CJZ3',
            '7k3qm-x9tpa-h2w8r-df6nb-4cjz3',
            ' 7K3QM X9TPA H2W8R DF6NB 4CJZ3 ',
            '７Ｋ３ＱＭ－Ｘ９ＴＰＡ－Ｈ２Ｗ８Ｒ－ＤＦ６ＮＢ－４ＣＪＺ３',
            "７K3QM\u{3000}X9TPA　H2W8R－DF6NB-4CJZ3",
            '7K3QMX9TPAH2W8RDF6NB4CJZ3',
        ] as $input) {
            $this->assertSame($expected, R::normalize($input), $input);
        }
    }

    public function testConfusableLettersAreReplaced(): void
    {
        // O→0、I・L→1（書き間違い・読み間違いでも通るようにする）
        $this->assertSame('0011', R::normalize('OoIl'));
        $generated = R::generate();
        $confused = strtr(R::format($generated), ['0' => 'O', '1' => 'I']);
        $this->assertSame($generated, R::normalize($confused));
    }

    public function testValidateReportsTheKindOfError(): void
    {
        $this->assertSame('INVALID_FORMAT', R::validate(''));
        $this->assertSame('INVALID_FORMAT', R::validate('7K3QMX9TPAH2W8RDF6NB4CJZ'), '24文字');
        $this->assertSame('INVALID_FORMAT', R::validate('7K3QMX9TPAH2W8RDF6NB4CJZ33'), '26文字');
        $this->assertSame('INVALID_FORMAT', R::validate('7K3QMX9TPAH2W8RDF6NB4CJZU'), 'U は使えない');
        $this->assertSame('INVALID_FORMAT', R::validate('7k3qmx9tpah2w8rdf6nb4cjz3'), '正規化前（小文字）');
        $this->assertSame('CHECK_CHARACTER_MISMATCH', R::validate('7K3QMX9TPAH2W8RDF6NB4CJZ4'));
    }
}
