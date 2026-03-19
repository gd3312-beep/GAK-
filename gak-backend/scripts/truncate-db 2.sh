#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-}"
MYSQL_SOCKET="${MYSQL_SOCKET:-/tmp/mysql.sock}"
MYSQL_HOST="${MYSQL_HOST:-}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
DB_NAME="${DB_NAME:-GAK}"
DB_ALLOW_DESTRUCTIVE="${DB_ALLOW_DESTRUCTIVE:-false}"

if [[ "${DB_ALLOW_DESTRUCTIVE}" != "true" ]]; then
  echo "Refusing truncate. Set DB_ALLOW_DESTRUCTIVE=true to continue."
  exit 1
fi

MYSQL_CMD=(mysql "-u${MYSQL_USER}")
if [[ -n "${MYSQL_PASSWORD}" ]]; then
  MYSQL_CMD+=("-p${MYSQL_PASSWORD}")
fi
if [[ -n "${MYSQL_SOCKET}" ]]; then
  MYSQL_CMD+=("--socket=${MYSQL_SOCKET}")
else
  MYSQL_CMD+=("-h" "${MYSQL_HOST:-127.0.0.1}" "-P" "${MYSQL_PORT}")
fi

echo "Truncating all base tables in '${DB_NAME}'..."

# Build a deterministic list of user tables and truncate with FK checks disabled.
TABLES=()
while IFS= read -r table_name; do
  [[ -n "${table_name}" ]] && TABLES+=("${table_name}")
done < <(
  "${MYSQL_CMD[@]}" -Nse \
    "SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = '${DB_NAME}' AND table_type = 'BASE TABLE'
     ORDER BY table_name;"
)

if [[ ${#TABLES[@]} -eq 0 ]]; then
  echo "No base tables found in '${DB_NAME}'."
  exit 0
fi

SQL_BATCH="SET FOREIGN_KEY_CHECKS=0;"
for table_name in "${TABLES[@]}"; do
  echo "-> TRUNCATE ${table_name}"
  SQL_BATCH="${SQL_BATCH} TRUNCATE TABLE \`${table_name}\`;"
done
SQL_BATCH="${SQL_BATCH} SET FOREIGN_KEY_CHECKS=1;"

"${MYSQL_CMD[@]}" "${DB_NAME}" -e "${SQL_BATCH}"

echo "Truncate complete."
