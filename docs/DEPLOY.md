# Deploying CodeMesh

The client is a static bundle that hosts free anywhere. The server needs a
Linux VM with Docker, and that's what this guide sets up.

## Why the server needs a real VM

The server drives the host's Docker daemon directly — `docker run` for deploy
previews, Install & Run, and step-through debugging — and keeps state on
disk: project git repos, Yjs documents, and the JSON files holding accounts
and projects. It also holds long-lived WebSocket connections.

That rules out the usual managed tiers. Vercel and Netlify don't run a
persistent process at all. Render, Railway, and Fly.io will run the process
and proxy WebSockets fine, but none give you the host's Docker socket, so
Deploy, Install & Run, and Debug stop working there.

**x86 keeps it simplest.** Piston, which powers Run and Tests, publishes an
`amd64`-only image:

```
ghcr.io/engineer-man/piston   linux/amd64 only  (single-arch manifest)
node:20-alpine                amd64 + arm64/v8 + others
```

On one x86 box everything just works. Anything with ~4 GB RAM will do —
Hetzner, DigitalOcean, Linode, Vultr and similar run about $4–6/month. 2 GB
is workable but tight once Piston has several language runtimes installed
alongside a deploy container.

**For a free deployment**, an Oracle Cloud "Always Free" **x86 micro**
(E2.1.Micro) runs the whole thing on one box, permanently, with every
feature working — Piston included, since it's x86. Its 1 GB of RAM and
fractional CPU are the limit: fine for a demo or portfolio link with a
handful of users, not for a busy instance. Add swap and it copes.

Oracle also offers a far larger free ARM instance (Ampere, 4 cores / 24 GB),
but Piston can't run on it, so that route needs two machines — see the
[Oracle appendix](#appendix-oracle-always-free). Worth knowing before you
reach for it: Piston ends up on the small x86 instance either way, so the
ARM box speeds up the editor and sync, not code execution. Unless you expect
real concurrent traffic, one x86 micro is the simpler trade.

**Don't put it next to anything you care about.** The server can control the
host's Docker daemon, which is root-equivalent on that box.

## Before you start

- A VM running Ubuntu 24.04, ideally 4 GB RAM
- A hostname pointing at the VM's IP. A registrar domain works; so does a
  free **DuckDNS** subdomain — sign in at duckdns.org, claim a name, paste
  in the server's IP, and `yourname.duckdns.org` resolves immediately.
  DuckDNS is on the Public Suffix List, so Let's Encrypt treats it as its
  own domain and issues certificates normally. (`nip.io` and `sslip.io`
  need no signup at all, but everyone shares one registered domain there,
  so certificate rate limits are frequently exhausted.)
- SSH access as a sudo-capable user

## Server

### 1. Automated setup

`deploy/setup.sh` performs every step in section 2 and is safe to re-run:

```bash
git clone https://github.com/lordflaxko/collab-editor.git
sudo bash collab-editor/deploy/setup.sh api.example.com
```

Then skip to [Configure](#3-configure). To understand or adjust what it does,
section 2 is the same sequence by hand.

### 2. Manual setup

**Packages and a service user**

```bash
sudo apt update && sudo apt install -y docker.io nginx git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

sudo useradd --system --create-home --home-dir /opt/codemesh codemesh
# Needed for deploy previews, Install & Run, and debugging.
sudo usermod -aG docker codemesh
```

**Piston**

```bash
sudo docker run -d --name piston_api --privileged --restart unless-stopped \
  -p 127.0.0.1:2000:2000 -v piston_packages:/piston/packages \
  ghcr.io/engineer-man/piston
```

Binding to `127.0.0.1` keeps it off the public internet. That's essential,
not tidiness: Piston executes arbitrary code on request with no
authentication, so anything that can reach it owns the machine.

Note the raised timeouts. Piston defaults to a 3-second run limit and 10 for
compiles, which assume a normal CPU. On a small shared-vCPU instance wall
clock runs far ahead of CPU time — a Go hello-world measured 133 ms of CPU
against 5 s of wall clock — so Go and Java get SIGKILLed mid-run and return
no output at all, which reads like a crash rather than a timeout. If Run
works for some languages but silently produces nothing for the slower ones,
this is why.

Install the language runtimes through the Piston API. Note the package
names don't always match the language: JavaScript installs as `node` and
C++ as `gcc`.

```bash
for pkg in "node 18.15.0" "typescript 5.0.3" "python 3.10.0" \
           "gcc 10.2.0" "go 1.16.2" "java 15.0.2" "rust 1.68.2"; do
  set -- $pkg
  curl -s -X POST http://127.0.0.1:2000/api/v2/packages \
    -H 'Content-Type: application/json' \
    -d "{\"language\":\"$1\",\"version\":\"$2\"}"
done
```

Those versions are pinned in `server/languages.js` and must match, or the
editor's Run button reports an unknown runtime.

Then the formatters. That script does `docker exec piston_api`, so it runs
on the machine holding the Piston container — the same one, here:

```bash
cd /opt/codemesh/server && npm run setup-formatters
```

**The app**

```bash
sudo -u codemesh git clone https://github.com/lordflaxko/collab-editor.git /opt/codemesh
cd /opt/codemesh/server && sudo -u codemesh npm ci --omit=dev
sudo -u codemesh cp .env.example .env
```

**Service and proxy**

```bash
sudo cp /opt/codemesh/deploy/codemesh.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now codemesh

sudo cp /opt/codemesh/deploy/nginx.conf /etc/nginx/sites-available/codemesh
sudo ln -s /etc/nginx/sites-available/codemesh /etc/nginx/sites-enabled/
```

Add the upgrade map once, inside the `http {}` block of
`/etc/nginx/nginx.conf`:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

Set `server_name` in the site file to your hostname, then:

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.example.com
```

**Firewall**

```bash
sudo ufw allow 22,80,443/tcp && sudo ufw enable
```

The server (1234) and Piston (2000) are both bound to loopback and reached
through nginx, so neither should ever be opened. If your provider has its
own cloud firewall (Hetzner and DigitalOcean both do), it's a second layer
that has to agree — a port closed there stays closed no matter what `ufw`
says.

### 3. Configure

```bash
sudo -u codemesh nano /opt/codemesh/server/.env
```

For a public instance:

```
CLIENT_URL=https://codemesh.example.com
TRUST_PROXY=1
GEMINI_API_KEY=...
RESEND_API_KEY=...
```

`TRUST_PROXY=1` matters: rate limiting keys off `X-Forwarded-For`, and
without it every visitor looks like nginx and shares one bucket. Set it only
because there *is* a proxy in front — the header is client-supplied
otherwise, so trusting it on a directly-exposed server lets anyone forge a
fresh identity per request.

Leave `ALLOW_PRIVATE_DB_HOSTS` and `RATE_LIMIT_DISABLED` unset. The first
lets the Database panel reach loopback and private addresses, including
cloud metadata endpoints; the second turns request limiting off entirely.
Both exist for local development and the test suite.

```bash
sudo systemctl restart codemesh
sudo systemctl status codemesh
```

## Client

`VITE_SERVER_URL` is inlined at build time, so the server URL must be known
before you build, and changing it means rebuilding.

```bash
cd client
VITE_SERVER_URL=https://api.example.com npm run build
```

That writes `client/dist` — plain static files, deployable anywhere.

**Netlify is the easiest option, and `netlify.toml` in the repo root already
configures it.** Connect the repository at netlify.com, then set
`VITE_SERVER_URL` under Site settings → Environment variables to your
server's URL and trigger a deploy. You get HTTPS and a `*.netlify.app`
hostname with no DNS work, and every push redeploys.

The config does one non-obvious thing worth keeping: it rewrites all paths
to `index.html`. The client routes on real paths, so without that rewrite
any direct link, refresh, or shared project URL returns 404 — only `/`
would work.

Cloudflare Pages and Vercel work the same way (build `npm run build`, output
`dist`, plus an equivalent SPA fallback). Or serve `dist` from the VM with
nginx if you'd rather keep everything in one place.

Make sure `CLIENT_URL` in the server's `.env` matches wherever the client
ended up, so password-reset links point at the right place.

## Verifying

```bash
curl -s https://api.example.com/projects/public          # should return JSON
sudo journalctl -u codemesh -n 50 --no-pager
```

Then open the client, sign up, create a project, and check that the editor
reaches **Connected** — that confirms the WebSocket upgrade is surviving the
proxy, which is the step most likely to be misconfigured. Run some code to
confirm Piston is wired up.

## Before you share the link

- **Rate limits are conservative** — 10 auth attempts per 15 minutes per IP,
  20 expensive operations per minute. Tune `LIMITS` in
  `server/rateLimit.js` if that's wrong for your traffic.
- **They're per-process and in memory.** Running more than one server
  process needs them moved to shared storage.
- **WebSocket connections aren't rate limited** — only HTTP routes are.
- **There's no disk quota.** Projects accumulate git repos and Yjs data
  indefinitely. Watch `df -h` and prune abandoned projects.
- **Anyone can sign up, and signed-up users can run code.** That's the
  product working as intended, but worth knowing before posting the link
  somewhere busy.

## Appendix: Oracle Always Free

Oracle's generous free shape (Ampere A1, 4 cores / 24 GB) is ARM, and Piston
has no ARM image. Everything else runs there fine — the server is plain
Node, and Deploy / Install & Run / Debug use `node:20-alpine`, which has an
arm64 build.

Always Free also includes two x86 E2.1.Micro instances, so Piston can run
natively on one of those:

```
Ampere A1 (ARM)                      E2.1.Micro (x86, 1 GB)
┌────────────────────────────┐       ┌──────────────────────────┐
│ CodeMesh server            │       │ Piston                   │
│ nginx + TLS                │──────▶│ :2000, private subnet    │
│ deploy/debug containers    │       └──────────────────────────┘
└────────────────────────────┘
```

Run and Tests need no code changes — point the server at the micro's
**private** VCN address:

```
PISTON_WS_URL=ws://10.0.0.x:2000/api/v2/connect
PISTON_HTTP_URL=http://10.0.0.x:2000/api/v2/execute
```

Bind Piston to that private address rather than `0.0.0.0`, and allow TCP
2000 only from the ARM instance:

```bash
sudo ufw allow from 10.0.0.x to any port 2000 proto tcp
```

**Install the formatter toolchains on the ARM box.** Go, Rust, and C++ are
formatted by `docker exec`-ing into a local `piston_api` container when one
exists — which it doesn't here. `server/format.js` prefers a formatter on
the host's `PATH` and only falls back to the container, so installing them
natively restores all three (each has an arm64 build):

```bash
sudo apt install -y golang-go clang-format
sudo snap install rustup --classic && rustup default stable
```

Without them those three languages lose their Format button; everything else
is unaffected either way, and Run and Tests work regardless since they reach
Piston over the network.

Two Oracle-specific snags: ARM capacity is frequently exhausted in popular
regions, so provisioning can fail for days, and Oracle's Ubuntu images ship
restrictive `iptables` rules — opening a port in the VCN security list is
not enough on its own.

Running Piston on the ARM box under `qemu-user-static` emulation avoids the
split, but every runtime is then interpreted instruction by instruction;
expect compiled languages to be slow enough to hit execution timeouts.
