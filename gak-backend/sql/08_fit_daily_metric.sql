USE GAK;

CREATE TABLE IF NOT EXISTS fit_daily_metric (
  user_id VARCHAR(255) NOT NULL,
  metric_date DATE NOT NULL,
  steps INT NULL,
  calories FLOAT NULL,
  heart_rate_avg FLOAT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, metric_date),
  FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB;

CREATE INDEX idx_fit_daily_metric_date ON fit_daily_metric (metric_date);

