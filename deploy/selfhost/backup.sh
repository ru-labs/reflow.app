#!/usr/bin/env bash
# Nightly pg_dump of every environment's db container into $BACKUP_DIR/<env>/.
# Environments are "<env>:<dokploy compose project>" pairs (the project is the
# com.docker.compose.project label, see docs/plans/selfhost-azure-poc/00-overview.md).
set -euo pipefail

ENVS="${ENVS:-test:reflowpoc-reflow-edbr4g prod:reflowpoc-reflowprod-o8by2i}"
BACKUP_DIR="${BACKUP_DIR:-/opt/reflow/backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"

status=0
for pair in $ENVS; do
  env="${pair%%:*}"
  project="${pair#*:}"
  dir="$BACKUP_DIR/$env"
  mkdir -p "$dir"
  db=$(docker ps -qf "label=com.docker.compose.project=$project" -f "label=com.docker.compose.service=db")
  out="$dir/reflow-$(date +%F).dump"
  # dump to a temp name so a failed run never leaves an empty .dump that looks valid
  if [ -n "$db" ] && docker exec "$db" pg_dump -U reflow -Fc reflow > "$out.tmp" && [ -s "$out.tmp" ]; then
    mv "$out.tmp" "$out"
    find "$dir" -name '*.dump' -mtime +"$KEEP_DAYS" -delete
    echo "$env: $(du -h "$out" | cut -f1) -> $out"
  else
    rm -f "$out.tmp"
    echo "$env: BACKUP FAILED" >&2
    status=1
  fi
done
exit $status
