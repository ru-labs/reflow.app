#!/usr/bin/env bash
# After a reboot Docker starts dokploy-traefik before Swarm has created the
# dokploy-network overlay, so it exits (128) and stays down. Retry until it runs.
# Install: crontab line `@reboot /opt/reflow/start-traefik.sh >> /opt/reflow/start-traefik.log 2>&1`
for i in $(seq 1 30); do
  if [ "$(docker inspect -f '{{.State.Running}}' dokploy-traefik 2>/dev/null)" = "true" ]; then
    echo "$(date -Is) dokploy-traefik running"; exit 0
  fi
  docker start dokploy-traefik >/dev/null 2>&1 || true
  sleep 10
done
echo "$(date -Is) dokploy-traefik did not start" >&2; exit 1
