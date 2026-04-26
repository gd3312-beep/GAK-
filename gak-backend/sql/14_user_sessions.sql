USE GAK;

CREATE TABLE IF NOT EXISTS user_session (
  session_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  device_id VARCHAR(128) NOT NULL,
  device_name VARCHAR(128) NOT NULL,
  user_agent VARCHAR(512) NULL,
  ip_address VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL DEFAULT NULL,
  revoked_reason VARCHAR(64) NULL DEFAULT NULL,
  CONSTRAINT fk_user_session_user
    FOREIGN KEY (user_id) REFERENCES app_user(user_id)
    ON DELETE CASCADE,
  INDEX idx_user_session_user_active (user_id, revoked_at, expires_at),
  INDEX idx_user_session_last_seen (user_id, last_seen_at)
) ENGINE=InnoDB;
