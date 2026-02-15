#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-}"
MYSQL_SOCKET="${MYSQL_SOCKET:-/tmp/mysql.sock}"
MYSQL_HOST="${MYSQL_HOST:-}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
DB_NAME="${DB_NAME:-GAK}"
DB_RESET="${DB_RESET:-true}"

MYSQL_CMD=(mysql "-u${MYSQL_USER}")
if [[ -n "${MYSQL_PASSWORD}" ]]; then
  MYSQL_CMD+=("-p${MYSQL_PASSWORD}")
fi
if [[ -n "${MYSQL_SOCKET}" ]]; then
  MYSQL_CMD+=("--socket=${MYSQL_SOCKET}")
else
  MYSQL_CMD+=("-h" "${MYSQL_HOST:-127.0.0.1}" "-P" "${MYSQL_PORT}")
fi

SQL_FILES=(
  "sql/01_schema.sql"
  "sql/02_constraints.sql"
  "sql/05_advanced_features.sql"
  "sql/07_academia_integration.sql"
  "sql/08_fit_daily_metric.sql"
  "sql/09_workout_plan_details.sql"
  "sql/views.sql"
  "sql/03_sample_data.sql"
  "sql/06_advanced_sample_data.sql"
  "sql/04_run_demo_queries.sql"
)

echo "Applying SQL files to MySQL using user '${MYSQL_USER}'..."

if [[ "${DB_RESET}" == "true" ]]; then
  echo "Resetting database '${DB_NAME}' for a clean bootstrap run..."
  "${MYSQL_CMD[@]}" -e "DROP DATABASE IF EXISTS \`${DB_NAME}\`;"
fi

for sql_file in "${SQL_FILES[@]}"; do
  echo "-> ${sql_file}"
  "${MYSQL_CMD[@]}" < "${ROOT_DIR}/${sql_file}"
done

echo "Database bootstrap complete."
