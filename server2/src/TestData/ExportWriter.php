<?php

declare(strict_types=1);

namespace UecTst\TestData;

use DateTimeImmutable;

/**
 * CSV・ZIP を、データベースから読みながら、順に出力する（全体をメモリに載せない。ApiSpec_TestData.md 4.3）。
 * セッションを BATCH 件ずつ読み、その回答をまとめて読む。
 */
final class ExportWriter
{
    private const BATCH = 50;

    public function __construct(
        private readonly TestSessionRepository $repository,
        private readonly SessionMetrics $metrics,
    ) {
    }

    /**
     * 1つの CSV（種類・ユーザ・種別が決まっているもの）を出力する。データがなければ、見出しの行のみ。
     *
     * @param callable(string): void $write
     */
    public function writeCsv(callable $write, DataScope $scope, TestDataFilter $filter, string $type, string $kind): void
    {
        $write(Csv::BOM);
        $this->writeBody($write, $scope, $filter, $type, $kind);
    }

    /**
     * ZIP を出力する。<種類>/<responses|sessions>_<ユーザ ID>.csv を、(種類、ユーザ) ごとに作る。
     *
     * @param callable(string): void $write
     * @param list<string> $kinds
     */
    public function writeZip(callable $write, DataScope $scope, TestDataFilter $filter, array $kinds, DateTimeImmutable $now): void
    {
        $zip = new ZipStream($write, $now);
        foreach ($this->repository->groups($scope, $filter) as $group) {
            $type = (string) $group['test_type'];
            $userId = (string) $group['user_id'];
            foreach ($kinds as $kind) {
                $zip->startFile($type . '/' . $kind . '_' . SessionView::uuid($userId) . '.csv');
                $zip->write(Csv::BOM);
                $this->writeBody($zip->write(...), $scope, $filter->withTestType($type)->withUser($userId), $type, $kind);
                $zip->endFile();
            }
        }
        $zip->finish();
    }

    /** @param callable(string): void $write */
    private function writeBody(callable $write, DataScope $scope, TestDataFilter $filter, string $type, string $kind): void
    {
        $filter = $filter->withTestType($type);
        $write(Csv::line(ExportFormat::headers($type, $kind)));

        $after = null;
        do {
            $sessions = $this->repository->pageAscending($scope, $filter, self::BATCH, $after);
            if ($sessions === []) {
                break;
            }
            $after = $sessions[count($sessions) - 1];
            $ids = array_map(static fn (array $s): string => (string) $s['id'], $sessions);
            $lines = '';
            if ($kind === ExportFormat::KIND_RESPONSES) {
                $children = $type === TestType::TRAINING
                    ? $this->repository->trialsFor($ids)
                    : $this->repository->responsesFor($type, $ids);
                foreach ($sessions as $session) {
                    foreach (ExportFormat::responseRows($session, $children[(string) $session['id']] ?? []) as $row) {
                        $lines .= Csv::line($row);
                    }
                }
            } else {
                $metrics = $this->metrics->forSessions($sessions);
                foreach ($sessions as $session) {
                    $lines .= Csv::line(ExportFormat::sessionRow($session, $metrics[(string) $session['id']]));
                }
            }
            $write($lines);
        } while (count($sessions) === self::BATCH);
    }
}
