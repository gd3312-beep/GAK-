USE GAK;

SET @app_user_profile_image_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'app_user'
    AND COLUMN_NAME = 'profile_image_url'
);

SET @app_user_profile_image_sql := IF(
  @app_user_profile_image_exists = 0,
  'ALTER TABLE app_user ADD COLUMN profile_image_url TEXT NULL',
  'SELECT 1'
);

PREPARE app_user_profile_image_stmt FROM @app_user_profile_image_sql;
EXECUTE app_user_profile_image_stmt;
DEALLOCATE PREPARE app_user_profile_image_stmt;
