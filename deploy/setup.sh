#!/usr/bin/env bash
#
# Provisions a fresh Ubuntu VM to run CodeMesh.
#
#   sudo bash deploy/setup.sh api.example.com
#
# Safe to re-run: every step checks for its own result first, so this
# doubles as a repair tool after a partial or failed run.
#
# It deliberately stops short of two things. It does not run certbot, which
# needs DNS already pointing here and an email address; and it does not fill
# in .env, which needs your API keys. Both are printed as next steps.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/lordflaxko/CodeMesh-Collab-Code-Editor.git}"
APP_DIR=/opt/codemesh
APP_USER=codemesh
# The server needs 18+; Ubuntu has shipped at least that since 24.04.
NODE_MIN_MAJOR=18

SERVER_NAME="${1:-}"
if [[ -z "$SERVER_NAME" ]]; then
  echo "usage: sudo bash deploy/setup.sh <server-hostname>" >&2
  echo "   eg: sudo bash deploy/setup.sh api.example.com" >&2
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "This needs root. Re-run with sudo." >&2
  exit 1
fi

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

log "Installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# Node comes from Ubuntu's own repositories rather than NodeSource. That
# matters on a recent release: NodeSource publishes per-codename repos and
# has none for 26.04 ("resolute"), so its installer 404s, while Ubuntu
# itself already ships Node 22 there.
apt-get install -y -qq docker.io nginx git curl ca-certificates nodejs npm \
  python-is-python3 black openjdk-21-jre-headless

# Host-side formatter dependencies, each learned the hard way on a fresh box:
#
#  python-is-python3  format.js and setup-formatters.js both invoke `python`,
#                     which Ubuntu no longer provides by default (python3 only).
#  black              installed from apt rather than pip, since PEP 668 marks
#                     the system environment externally managed.
#  openjdk-21         google-java-format 1.19.2 calls javac internals that
#                     JDK 25 changed, failing with NoSuchMethodError. 21 is the
#                     newest LTS it works against, so pin it rather than take
#                     whatever default-jre points at.
if command -v update-alternatives >/dev/null; then
  java21=$(ls -d /usr/lib/jvm/java-21-openjdk-*/bin/java 2>/dev/null | head -1)
  [[ -n "$java21" ]] && update-alternatives --set java "$java21" >/dev/null 2>&1 || true
fi

node_major=$(node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/')
if [[ -z "$node_major" ]] || (( node_major < NODE_MIN_MAJOR )); then
  echo "Node ${NODE_MIN_MAJOR}+ required, found '${node_major:-none}'." >&2
  echo "Install a newer Node manually, then re-run this script." >&2
  exit 1
fi
log "Using Node $(node -v), npm $(npm -v)"

systemctl enable --now docker

log "Creating the ${APP_USER} service user"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$APP_DIR" "$APP_USER"
fi
# Grants control of the Docker daemon, which deploy previews, Install & Run,
# and step-through debugging all require. Worth being clear that this is
# root-equivalent on this host -- it is why the box should be disposable.
usermod -aG docker "$APP_USER"

log "Starting Piston"
if [[ -z "$(docker ps -aq -f name=^piston_api$)" ]]; then
  # Bound to loopback on purpose: Piston runs arbitrary code with no
  # authentication, so anything that can reach it owns this machine.
  #
  # The timeouts are raised well above Piston's defaults (3s run, 10s
  # compile) because those assume a normal CPU. On a small shared-vCPU
  # instance the wall clock runs far ahead of CPU time -- a Go hello-world
  # measured 133ms of CPU but 5s of wall clock -- so Go and Java were being
  # SIGKILLed mid-run with no output, looking like a crash rather than a
  # timeout. Generous limits cost nothing when nothing is hitting them.
  docker run -d --name piston_api --privileged --restart unless-stopped \
    -p 127.0.0.1:2000:2000 -v piston_packages:/piston/packages \
    -e PISTON_RUN_TIMEOUT=20000 \
    -e PISTON_COMPILE_TIMEOUT=60000 \
    -e PISTON_RUN_CPU_TIME=20000 \
    -e PISTON_COMPILE_CPU_TIME=60000 \
    ghcr.io/engineer-man/piston
else
  docker start piston_api >/dev/null 2>&1 || true
  echo "piston_api already exists -- left as is"
fi

log "Fetching the app into ${APP_DIR}"
if [[ -f "$APP_DIR/server/package.json" && ! -d "$APP_DIR/.git" ]]; then
  # Someone copied the tree up by hand (rsync/scp), which is how a private
  # repo gets here without giving the box a deploy key. Nothing to fetch.
  echo "Found an existing checkout with no git metadata -- leaving it alone"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
elif [[ -d "$APP_DIR/.git" ]]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only
else
  # useradd already made $APP_DIR, and git refuses to clone into a
  # non-empty directory, so clone aside and move the contents in.
  tmp=$(mktemp -d)
  chown "$APP_USER:$APP_USER" "$tmp"
  sudo -u "$APP_USER" git clone --depth 1 "$REPO_URL" "$tmp/repo"
  shopt -s dotglob
  mv "$tmp/repo"/* "$APP_DIR"/
  shopt -u dotglob
  rm -rf "$tmp"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
fi

log "Installing server dependencies"
sudo -u "$APP_USER" npm --prefix "$APP_DIR/server" ci --omit=dev --no-audit --no-fund

if [[ ! -f "$APP_DIR/server/.env" ]]; then
  sudo -u "$APP_USER" cp "$APP_DIR/server/.env.example" "$APP_DIR/server/.env"
  echo "Created server/.env from the example -- fill it in before going live"
fi

log "Installing the systemd service"
install -m 644 "$APP_DIR/deploy/codemesh.service" /etc/systemd/system/codemesh.service
systemctl daemon-reload
systemctl enable codemesh

log "Configuring nginx for ${SERVER_NAME}"
# The map goes in conf.d rather than being spliced into nginx.conf: Ubuntu
# already includes conf.d/*.conf inside the http{} block, so this lands in
# the right scope, and rewriting it is idempotent while editing nginx.conf
# in place would not be.
cat > /etc/nginx/conf.d/codemesh-upgrade-map.conf <<'EOF'
# Chooses the right Connection header per request: "upgrade" for a WebSocket
# handshake, "close" otherwise. Hardcoding "upgrade" breaks plain HTTP
# through the same proxy.
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

# Same as nginx's "combined" format but logging $uri instead of $request, so
# the query string never reaches disk. The collaboration WebSocket passes its
# session token as a query parameter, and the default format wrote that token
# -- valid for 30 days -- into the access log on every single connection.
log_format codemesh '$remote_addr - $remote_user [$time_local] '
                    '"$request_method $uri $server_protocol" '
                    '$status $body_bytes_sent "$http_referer" "$http_user_agent"';
EOF

sed "s/api\.example\.com/${SERVER_NAME}/g" \
  "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/codemesh
ln -sfn /etc/nginx/sites-available/codemesh /etc/nginx/sites-enabled/codemesh
# Ubuntu's default site answers on :80 for every hostname and would shadow
# ours on a fresh box.
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

log "Configuring the firewall"
# 1234 and 2000 stay closed: both are bound to loopback and reached through
# nginx.
ufw allow 22,80,443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status | sed 's/^/    /'

log "Starting CodeMesh"
systemctl restart codemesh
sleep 2
systemctl is-active --quiet codemesh \
  && echo "codemesh is running" \
  || { echo "codemesh failed to start:"; journalctl -u codemesh -n 30 --no-pager; exit 1; }

cat <<EOF

$(log "Done -- three things left")

  1. Fill in the environment file, then restart:
       sudo -u ${APP_USER} nano ${APP_DIR}/server/.env
       sudo systemctl restart codemesh

     For a public instance set CLIENT_URL and TRUST_PROXY=1, and leave
     ALLOW_PRIVATE_DB_HOSTS and RATE_LIMIT_DISABLED unset.

  2. Issue a certificate (needs ${SERVER_NAME} already resolving here):
       sudo apt install -y certbot python3-certbot-nginx
       sudo certbot --nginx -d ${SERVER_NAME}

  3. Install the language runtimes through the Piston API, then:
       cd ${APP_DIR}/server && sudo npm run setup-formatters

  Build the client separately, pointing it at this server:
       VITE_SERVER_URL=https://${SERVER_NAME} npm run build

EOF
