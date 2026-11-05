<?php

declare(strict_types=1);

namespace UecTst\TestData;

/** 利用データの種類（DataFormat_TestData.md 3.）。 */
final class TestType
{
    public const ABSOLUTE_PITCH = 'absolute_pitch';
    public const RELATIVE_PITCH = 'relative_pitch';
    public const FUNCTIONAL_PITCH = 'functional_pitch';
    public const TRAINING = 'training';

    public const ALL = [self::ABSOLUTE_PITCH, self::RELATIVE_PITCH, self::FUNCTIONAL_PITCH, self::TRAINING];

    /** 絶対音感の本番の問題数（TableSpec_TestData.md 2.2）。 */
    public const ABSOLUTE_PITCH_TOTAL_QUESTIONS = 60;

    /** 「中断」の扱いにする状態。includeInterrupted が false のとき除く（forced_termination は含める。ApiSpec_TestData.md 0.5）。 */
    public const INTERRUPTED_STATUSES = ['interrupted', 'audio_error'];

    public static function isValid(string $type): bool
    {
        return in_array($type, self::ALL, true);
    }

    /**
     * 種類ごとに使えるセッションの状態（DataFormat_TestData.md 3.）。
     *
     * @return list<string>
     */
    public static function statuses(string $type): array
    {
        return match ($type) {
            self::ABSOLUTE_PITCH => ['completed', 'forced_termination', 'interrupted'],
            self::RELATIVE_PITCH => ['completed', 'interrupted'],
            default => ['completed', 'audio_error', 'interrupted'],
        };
    }
}
