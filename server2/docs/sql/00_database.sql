-- データベース UECTSTDB の作成
-- 警告: UECTSTDB がすでに存在する場合は、中のテーブルとデータをすべて削除してから作り直す。
-- 文字コードは utf8mb4、照合順序は utf8mb4_bin（TableSpec_Account.md 0. 共通事項）。
-- 注意: Linux の MySQL（本番など）では、既定で、データベース名・テーブル名の大文字・小文字が区別される
--       （lower_case_table_names = 0）。UECTSTDB は、常にこの表記（大文字）で指定すること。

DROP DATABASE IF EXISTS UECTSTDB;
CREATE DATABASE UECTSTDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
