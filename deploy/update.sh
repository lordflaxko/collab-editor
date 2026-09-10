#!/usr/bin/env bash
#
# Pulls the latest code and restarts the server.
#
#   sudo bash /opt/codemesh/deploy/update.sh
#
# Expects setup.sh to have run already. Safe to run repeatedly; if nothing
# has changed upstream it says so and leaves the service alone rather than
# restarting for no reason.

set -euo pipefail

APP_DIR=/opt/codemesh
APP_USER=codemesh
BRANCH="${BRANCH:-master}"
HEALTH_URL=http://127.0.0.1:1234/projects/public

if [[ $EUID -ne 0 ]]; then
  echo "This needs root (systemctl). Re-run with sudo." >&2
  exit 1
fi

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
as_app() { sudo -u "$APP_USER" "$@"; }
git_app() { as_app git -C "$APP_DIR" "$@"; }

log "Fetching origin/${BRANCH}"
before=$(git_app rev-parse HEAD)
git_app fetch -q --depth 1 origin "$BRANCH"
after=$(git_app rev-parse FETCH_HEAD)

if [[ "$before" == "$after" ]]; then
  echo "Already up to date at ${before:0:8} -- nothing to do."
  exit 0
fi

# Captured before the reset, since afterwards the old lockfile is gone and
# there is nothing left to compare against.
lock_changed=false
if ! git_app diff --quiet "$before" "$after" -- server/package-lock.json server/package.json; then
  lock_changed=true
fi

log "Updating ${before:0:8} -> ${after:0:8}"
git_app --no-pager log --oneline "$before..$after" | head -10
# Untracked runtime state (.env, data/, repos/, node_modules) is gitignored,
# so a hard reset only touches files that came from the repo.
git_app reset -q --hard "$after"

if [[ "$lock_changed" == true ]]; then
  log "Dependencies changed -- reinstalling"
  as_app npm --prefix "$APP_DIR/server" ci --omit=dev --no-audit --no-fund
else
  echo "No dependency changes; skipping npm ci"
fi

log "Restarting"
systemctl restart codemesh

# The server takes a couple of seconds to bind, and restarting into a crash
# loop still reports "active" for a moment -- so poll the real endpoint
# rather than trusting systemd's word for it.
for i in $(seq 1 20); do
  if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
    log "Healthy at $(git_app rev-parse --short HEAD)"
    exit 0
  fi
  sleep 1
done

echo "Server did not come back within 20s. Recent logs:" >&2
journalctl -u codemesh -n 30 --no-pager >&2
echo >&2
echo "To roll back:  sudo -u ${APP_USER} git -C ${APP_DIR} reset --hard ${before}" >&2
echo "then:          sudo systemctl restart codemesh" >&2
exit 1
