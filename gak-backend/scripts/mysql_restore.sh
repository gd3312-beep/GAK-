#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup_file.sql>"
  exit 1
fi

BACKUP_FILE="$1"
if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-}"
MYSQL_SOCKET="${MYSQL_SOCKET:-/tmp/mysql.sock}"
MYSQL_HOST="${MYSQL_HOST:-}"
MYSQL_PORT="${MYSQL_PORT:-3306}"

MYSQL_CMD=(mysql "-u${MYSQL_USER}")
if [[ -n "${MYSQL_PASSWORD}" ]]; then
  MYSQL_CMD+=("-p${MYSQL_PASSWORD}")
fi
if [[ -n "${MYSQL_SOCKET}" ]]; then
  MYSQL_CMD+=("--socket=${MYSQL_SOCKET}")
else
  MYSQL_CMD+=("-h" "${MYSQL_HOST:-127.0.0.1}" "-P" "${MYSQL_PORT}")
fi

"${MYSQL_CMD[@]}" < "${BACKUP_FILE}"
echo "Restore completed from ${BACKUP_FILE}"
