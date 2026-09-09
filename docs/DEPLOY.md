# Deploying CodeMesh

The client is a static bundle and hosts anywhere for free. The server is the
constrained half, so start there.

## Why the server needs a real VM

The server drives the host's Docker daemon directly — `docker run` for
deploy previews, Install & Run, and step-through debugging — and it keeps
state on disk: project git repos, Yjs documents, and the JSON files holding
accounts and projects. It also holds long-lived WebSocket connections.

That rules out the usual managed tiers. Vercel and Netlify don't run a
persistent process at all. Render, Railway, and Fly.io will run the process
and proxy WebSockets fine, but none give you the host's Docker socket, so
**Deploy, Install & Run, and Debug stop working** there. Run, Format, and
Tests still work on those platforms if you point them at a Piston instance
hosted elsewhere.

If you want every feature, you need a Linux VM you control.

### Free options

| Option | Everything works? | Catch |
| --- | --- | --- |
| Oracle Cloud "Always Free" | Yes, across two instances | See below — the architecture split is forced by Piston. |
| Google Cloud free `e2-micro` | Tight | 1 GB RAM. Piston plus the server plus a deploy container will thrash. |
| Fly.io / Render free tier | No | No Docker socket, so Deploy / Install & Run / Debug are unavailable. Free instances also sleep when idle, which drops collaboration sockets. |
| Any small paid VPS (~$4–6/mo) | Yes | Costs money, but it's the least fragile path. |

Verify the current terms yourself — free tiers change often.

**Whatever you pick, don't put it next to anything you care about.** The
server can control the host's Docker daemon, which is root-equivalent on
that box.

## Oracle Cloud: use both free shapes

One constraint drives the whole layout:

```
ghcr.io/engineer-man/piston   linux/amd64 only  (single-arch manifest)
node:20-alpine                amd64 + arm64/v8 + others
```

Oracle's generous free shape is **Ampere A1**, which is ARM. Everything runs
there *except* Piston — the server is plain Node, and Deploy, Install & Run,
and Debug all use `node:20-alpine`, which has an arm64 build. Only Run,
Format, and Tests need Piston, and its image has no ARM variant at all.

Always Free also includes two **E2.1.Micro** instances, which are x86. So
run Piston on one of those, natively:

```
Ampere A1 (ARM, several GB RAM)      E2.1.Micro (x86, 1 GB RAM)
┌────────────────────────────┐       ┌──────────────────────────┐
│ CodeMesh server            │       │ Piston                   │
│ nginx + TLS                │──────▶│ :2000, private subnet    │
│ deploy/debug containers    │       └──────────────────────────┘
└────────────────────────────┘
```

Run and Tests need no code changes — the server already reads Piston's
location from the environment. (Formatting for Go, Rust, and C++ is the one
thing that doesn't survive the split; see the note under Piston below.) On
the ARM box, point it at the micro instance's **private** VCN address:

```
PISTON_WS_URL=ws://10.0.0.x:2000/api/v2/connect
PISTON_HTTP_URL=http://10.0.0.x:2000/api/v2/execute
```

Keep Piston on the private subnet and don't give it a public IP. Add an
ingress rule on the micro's security list allowing TCP 2000 from the ARM
instance's address only.

Two Oracle-specific snags worth knowing before you start: ARM capacity is
frequently exhausted in popular regions, so provisioning may fail repeatedly
with an out-of-capacity error, and Oracle's images ship with restrictive
`iptables` rules — opening a port in the VCN security list is not enough on
its own.

### If you'd rather use one box

You can run Piston on the ARM instance under emulation, with
`--platform linux/amd64` and `qemu-user-static` registered via binfmt. It
works, but every language runtime is then interpreted instruction by
instruction. Expect scripting languages to feel sluggish and compiled ones
(C++, Rust, Java) to be slow enough that runs may hit the execution timeout.
The two-instance split above avoids all of that.

## Server

Assumes Ubuntu with a hostname like `api.example.com` pointed at the VM.

### 1. Docker, Node, and a service user

```bash
sudo apt update && sudo apt install -y docker.io nginx git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

sudo useradd --system --create-home --home-dir /opt/codemesh codemesh
# Needed for the deploy/debug/Install & Run features.
sudo usermod -aG docker codemesh
```

### 2. Piston

Run this on whichever machine is x86 — the same box on a normal VPS, or the
E2.1.Micro instance in the Oracle split above.

```bash
# Same box as the server:
sudo docker run -d --name piston_api --privileged --restart unless-stopped \
  -p 127.0.0.1:2000:2000 -v piston_packages:/piston/packages \
  ghcr.io/engineer-man/piston

# Separate box: bind to its private address, never 0.0.0.0
sudo docker run -d --name piston_api --privileged --restart unless-stopped \
  -p 10.0.0.x:2000:2000 -v piston_packages:/piston/packages \
  ghcr.io/engineer-man/piston
```

Either way Piston must never be publicly reachable — it exists to execute
arbitrary code, so anyone who can reach it can run whatever they like on
that machine, with no account required.

Then install the language runtimes you want through the Piston API, and set
up the formatters. That script runs `docker exec piston_api`, so it has to
run **on whichever machine the Piston container is on**:

```bash
cd /opt/codemesh/server && npm run setup-formatters
```

> **Formatting doesn't cross machines.** Go, Rust, and C++ are formatted by
> `docker exec`-ing into the local `piston_api` container, so in the
> two-instance Oracle split those three lose their Format button — the
> server's Docker daemon has no such container. JavaScript, TypeScript,
> Python, and Java format in-process on the server and are unaffected, and
> **Run and Tests work fine either way**, since those reach Piston over the
> network rather than through Docker.
>
> If Format matters for Go, Rust, or C++, put Piston on the same machine as
> the server — which on Oracle means the emulation route below, or giving up
> the ARM instance and running everything on one x86 micro.

### 3. The app

```bash
sudo -u codemesh git clone https://github.com/lordflaxko/collab-editor.git /opt/codemesh
cd /opt/codemesh/server && sudo -u codemesh npm ci --omit=dev
sudo -u codemesh cp .env.example .env
sudo -u codemesh nano .env
```

For a public instance, set at minimum:

```
CLIENT_URL=https://codemesh.example.com
TRUST_PROXY=1
GEMINI_API_KEY=...
RESEND_API_KEY=...

# Only when Piston runs on another machine (the Oracle split):
PISTON_WS_URL=ws://10.0.0.x:2000/api/v2/connect
PISTON_HTTP_URL=http://10.0.0.x:2000/api/v2/execute
```

`TRUST_PROXY=1` matters: rate limiting keys off `X-Forwarded-For`, and
without it every visitor looks like nginx and shares one bucket. Only set it
because there *is* a proxy in front — the header is client-supplied
otherwise.

Leave `ALLOW_PRIVATE_DB_HOSTS` and `RATE_LIMIT_DISABLED` unset. The first
lets the Database panel reach loopback and private addresses, including
cloud metadata endpoints; the second turns request limiting off entirely.
Both exist for local development and the test suite.

### 4. Service and proxy

```bash
sudo cp /opt/codemesh/deploy/codemesh.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now codemesh

sudo cp /opt/codemesh/deploy/nginx.conf /etc/nginx/sites-available/codemesh
sudo ln -s /etc/nginx/sites-available/codemesh /etc/nginx/sites-enabled/
```

Add the upgrade map once, in the `http {}` block of
`/etc/nginx/nginx.conf`:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

Then edit `server_name` in the site file, and:

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.example.com
```

### 5. Firewall

```bash
sudo ufw allow 22,80,443/tcp && sudo ufw enable
```

The server (1234) is reached through nginx, so it stays closed. Piston
(2000) stays closed too when it's on the same box.

In the Oracle split, the Piston instance needs 2000 reachable from the ARM
instance and nowhere else — in its own firewall and in the VCN security
list:

```bash
# On the Piston instance only, where 10.0.0.x is the ARM instance:
sudo ufw allow from 10.0.0.x to any port 2000 proto tcp
```

Do not open 2000 to `0.0.0.0/0`. Piston executes arbitrary code on request,
with no authentication — anything that can reach it owns that machine.

Oracle's Ubuntu images also ship `iptables` rules that drop most inbound
traffic regardless of what the VCN security list says, so check both layers
if a port seems open but nothing connects.

## Client

`VITE_SERVER_URL` is inlined at build time, so the server URL must be known
before you build, and changing it means rebuilding.

```bash
cd client
VITE_SERVER_URL=https://api.example.com npm run build
```

That writes `client/dist`, which is plain static files. Deploy them to
Cloudflare Pages, Netlify, or Vercel — all free for this — or serve them
from the same VM with nginx.

On a static host, set the build command to
`npm run build`, the output directory to `dist`, and add `VITE_SERVER_URL`
as an environment variable in the project's settings.

Finally, set `CLIENT_URL` in the server's `.env` to wherever the client
ended up, so password-reset emails link to the right place, and restart:
`sudo systemctl restart codemesh`.

## Before you share the link

- **Rate limits are in place** but tuned conservatively — 10 auth attempts
  per 15 minutes per IP, 20 expensive operations per minute. Adjust `LIMITS`
  in `server/rateLimit.js` if they're wrong for your traffic.
- **They're per-process and in memory.** Running more than one server
  process needs them moved to shared storage.
- **WebSocket connections aren't rate limited** — only HTTP routes are. A
  client can still open sync sockets freely.
- **There's no disk quota.** Projects accumulate git repos and Yjs data
  indefinitely. Watch `df -h` and prune abandoned projects.
- **Anyone can sign up**, and signed-up users can run code. That's the
  product working as intended, but it's worth knowing before posting the
  link somewhere busy.
