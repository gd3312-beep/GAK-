USE GAK;

SET @has_last_sync_checksum := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'academia_account'
    AND column_name = 'last_sync_checksum'
);

SET @add_last_sync_checksum_sql := IF(
  @has_last_sync_checksum = 0,
  'ALTER TABLE academia_account ADD COLUMN last_sync_checksum CHAR(64) NULL AFTER last_error',
  'SELECT 1'
);

PREPARE add_last_sync_checksum_stmt FROM @add_last_sync_checksum_sql;
EXECUTE add_last_sync_checksum_stmt;
DEALLOCATE PREPARE add_last_sync_checksum_stmt;
