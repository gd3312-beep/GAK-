#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-./backups}"
TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
FILE_PATH="${OUT_DIR}/gak_backup_${TIMESTAMP}.sql"

MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-}"
MYSQL_DB="${MYSQL_DB:-GAK}"
MYSQL_SOCKET="${MYSQL_SOCKET:-/tmp/mysql.sock}"
MYSQL_HOST="${MYSQL_HOST:-}"
MYSQL_PORT="${MYSQL_PORT:-3306}"

mkdir -p "${OUT_DIR}"

DUMP_CMD=(mysqldump "-u${MYSQL_USER}")
if [[ -n "${MYSQL_PASSWORD}" ]]; then
  DUMP_CMD+=("-p${MYSQL_PASSWORD}")
fi
DUMP_CMD+=("--single-transaction" "--routines" "--triggers")
if [[ -n "${MYSQL_SOCKET}" ]]; then
  DUMP_CMD+=("--socket=${MYSQL_SOCKET}")
else
  DUMP_CMD+=("-h" "${MYSQL_HOST:-127.0.0.1}" "-P" "${MYSQL_PORT}")
fi
DUMP_CMD+=("${MYSQL_DB}")

"${DUMP_CMD[@]}" > "${FILE_PATH}"
echo "Backup created: ${FILE_PATH}"
