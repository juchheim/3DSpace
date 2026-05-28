# Hetzner LiveKit + Caddy for `3dspace.tripjuchheim.com`

This folder is a **beginner-complete** runbook for a CX23 (or similar) Ubuntu server.

## Your server (this deployment)

| Setting | Value |
| --- | --- |
| **Hostname** | `3dspace.tripjuchheim.com` |
| **Hetzner public IPv4** | `178.105.34.126` |
| **Cloudflare A record** | Name `3dspace` → Content `178.105.34.126` (DNS only / grey cloud) |
| **SSH login** | `ssh root@178.105.34.126` |

**What you end up with:**

- Browsers connect to `wss://3dspace.tripjuchheim.com` (HTTPS on port 443).
- Caddy terminates TLS and forwards to LiveKit on `127.0.0.1:7880`.
- Your Koyeb API mints tokens; Vercel web app connects using env vars.

**Files here:**

| File | Purpose |
| --- | --- |
| `Caddyfile` | Reverse proxy config (copy to `/etc/caddy/Caddyfile` on the server) |
| `livekit.yaml` | Minimal LiveKit server config |
| `docker-compose.yml` | Runs LiveKit in Docker bound to localhost only |

---

## Before you start (checklist)

Do these **before** SSH. If any item is missing, stop and fix it first.

1. **Hetzner server** exists (Ubuntu 24.04) at **`178.105.34.126`**.
2. **Cloudflare DNS** for zone `tripjuchheim.com`:
   - Type **A**, Name **`3dspace`**, Content **`178.105.34.126`**, Proxy = **DNS only** (grey cloud).
3. From your Mac, DNS works:

   ```bash
   dig +short 3dspace.tripjuchheim.com A
   ```

   Expected output (exactly this line, nothing else):

   ```text
   178.105.34.126
   ```

   If you see a different IP or no output, fix the Cloudflare record and wait a few minutes.

4. You can **SSH** as root (Hetzner emails you the root password on create, or you added an SSH key at create time).

---

## Part A — Log into the server

### A1. Open Terminal on your Mac

- Press **Cmd + Space**, type **Terminal**, press **Enter**.

### A2. SSH as root

```bash
ssh root@178.105.34.126
```

**First time only:** you may see:

```text
Are you sure you want to continue connecting (yes/no)?
```

Type `yes` and press **Enter**.

**Password login:** paste the root password from Hetzner (paste is often **Cmd + V**; you will not see characters as you type). Press **Enter**.

**SSH key login:** you should land in a shell like:

```text
root@ubuntu-4gb-nbg1-1:~#
```

You are now **on the server**. Every command below runs there unless it says "on your Mac".

### A3. Optional: set hostname (cosmetic)

```bash
hostnamectl set-hostname livekit-3dspace
```

---

## Part B — Update Ubuntu and install basics

Run each block; wait until the prompt returns.

```bash
apt-get update
```

```bash
apt-get upgrade -y
```

```bash
apt-get install -y curl ca-certificates gnupg ufw
```

---

## Part C — Firewall (UFW)

Open the ports LiveKit and Caddy need.

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 7881/udp
ufw allow 3478/udp
ufw allow 5349/tcp
ufw allow 50000:60000/udp
```

Enable firewall (type `y` when asked):

```bash
ufw enable
```

Check status:

```bash
ufw status numbered
```

You should see **80, 443, 7881, 3478, 5349, 50000:60000** allowed.

> **Also check Hetzner Cloud Firewall** (in the web console): if you attached a Cloud Firewall that blocks UDP, open the same ports there too.

---

## Part D — Install Docker

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
```

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo ${VERSION_CODENAME}) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
```

```bash
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

Verify:

```bash
docker --version
docker compose version
```

---

## Part E — Install LiveKit (Docker)

### E1. Create a directory for config

```bash
mkdir -p /opt/livekit
cd /opt/livekit
```

### E2. Generate API key and secret

```bash
docker run --rm livekit/livekit-server generate-keys
```

**Important:** copy the output somewhere safe (Notes app). Example shape:

```text
API Key: APIxxxxxxxx
API Secret: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

You will paste these into **Koyeb** later as `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.

### E3. Create `livekit.yaml` on the server

The file below already sets `node_ip` to **`178.105.34.126`**. You only need to add your API key and secret from **E2**.

```bash
cat > /opt/livekit/livekit.yaml <<'EOF'
port: 7880
bind_addresses:
  - 127.0.0.1

rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
  node_ip: 178.105.34.126

turn:
  enabled: false
  # Enable after Caddy has Let's Encrypt certs (see "Enable TURN later" below).
  # domain: 3dspace.tripjuchheim.com
  # tls_port: 5349
  # udp_port: 3478
  # cert_file: /etc/caddy/certs/3dspace.tripjuchheim.com.crt
  # key_file: /etc/caddy/certs/3dspace.tripjuchheim.com.key

keys:
  REPLACE_API_KEY: REPLACE_API_SECRET
EOF
```

Edit the file and insert your real key and secret:

```bash
nano /opt/livekit/livekit.yaml
```

In nano:

- Move with arrow keys.
- Replace `REPLACE_API_KEY` with the **API Key** from **E2** (keep the colon `:` after it).
- Replace `REPLACE_API_SECRET` with the **API Secret** from **E2**.
- Do **not** change `node_ip: 178.105.34.126` unless you rebuild the server and get a new IP (then update Cloudflare DNS too).
- Save: **Ctrl + O**, **Enter**, exit: **Ctrl + X**.

### E4. Create `docker-compose.yml` on the server

```bash
cat > /opt/livekit/docker-compose.yml <<'EOF'
services:
  livekit:
    image: livekit/livekit-server:latest
    command: --config /etc/livekit.yaml
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml:ro
EOF
```

### E5. Start LiveKit

```bash
cd /opt/livekit
docker compose up -d
```

Check it is running:

```bash
docker compose ps
```

You should see `livekit` **running**.

Check port 7880 is listening **only on localhost**:

```bash
ss -tlnp | grep 7880
```

You want `127.0.0.1:7880` in the output.

### E6. Quick local test (on the server)

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7880/
```

Any HTTP status (often `200` or `404`) means LiveKit is reachable locally. Connection refused means LiveKit is not up — run `docker compose logs` and fix errors first.

**If logs say `TURN tls cert required`:** you enabled TURN before Caddy had certificates. Set `turn.enabled: false` in `livekit.yaml`, then `docker compose down && docker compose up -d`.

### Enable TURN later (after Part F — Caddy has HTTPS)

1. Confirm `curl -I https://3dspace.tripjuchheim.com` works.
2. Export Caddy’s cert for LiveKit (paths vary; common approach):

   ```bash
   mkdir -p /etc/caddy/certs
   # After Caddy has obtained a cert, copy from Caddy storage (example paths):
   # cp "$(find /var/lib/caddy -name '*.crt' | head -1)" /etc/caddy/certs/3dspace.tripjuchheim.com.crt
   # cp "$(find /var/lib/caddy -name '*.key' | head -1)" /etc/caddy/certs/3dspace.tripjuchheim.com.key
   ```

3. Set in `livekit.yaml`: `turn.enabled: true`, `domain`, `cert_file`, `key_file`, then restart LiveKit.

For **two-browser testing on open networks**, TURN can wait. For **Safari / school Wi‑Fi**, enable TURN after certs exist.

---

## Part F — Install Caddy

### F1. Add Caddy package repository

```bash
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy
```

Verify:

```bash
caddy version
```

### F2. Back up the default Caddyfile (if any)

```bash
mv /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$(date +%Y%m%d) 2>/dev/null || true
```

### F3. Install **our** Caddyfile

**Option 1 — copy from your Mac (if you have the repo cloned)**

On your **Mac** (new Terminal tab, not SSH):

```bash
scp /Users/ejuchheim/Projects/3DSpace/3DSpace/deploy/hetzner-livekit/Caddyfile root@178.105.34.126:/etc/caddy/Caddyfile
```

**Option 2 — type it on the server**

On the **server**:

```bash
cat > /etc/caddy/Caddyfile <<'EOF'
3dspace.tripjuchheim.com {
	reverse_proxy 127.0.0.1:7880
}
EOF
```

Confirm contents:

```bash
cat /etc/caddy/Caddyfile
```

You must see exactly `3dspace.tripjuchheim.com` and `reverse_proxy 127.0.0.1:7880`.

### F4. Validate Caddy config

```bash
caddy validate --config /etc/caddy/Caddyfile
```

Expected: `Valid configuration`.

If you see errors, fix the file with `nano /etc/caddy/Caddyfile` and run validate again.

### F5. Reload Caddy

```bash
systemctl enable caddy
systemctl reload caddy
```

Check status:

```bash
systemctl status caddy --no-pager
```

You want **active (running)** in green.

### F6. Watch Caddy obtain a certificate (first time)

```bash
journalctl -u caddy -f
```

Look for lines about **certificate obtained** or **success** for `3dspace.tripjuchheim.com`.

Press **Ctrl + C** to stop following logs.

**If certificate fails:**

- DNS must point to **`178.105.34.126`**:

  ```bash
  dig +short 3dspace.tripjuchheim.com A
  ```

- Port **80** must be open (UFW + Hetzner firewall).
- Cloudflare record must be **DNS only** (grey cloud), Content **`178.105.34.126`**.

---

## Part G — Test HTTPS from your Mac

On your **Mac** (not SSH):

```bash
curl -I https://3dspace.tripjuchheim.com
```

**Good signs:**

- No certificate error.
- You get HTTP headers (`HTTP/2 200` or similar).

**Bad signs:**

- `Could not resolve host` → DNS not set or not propagated.
- `Connection refused` → Caddy not running or firewall blocks 443.
- `certificate verify failed` → wait a minute and check `journalctl -u caddy`.

---

## Part H — Point 3DSpace at this server

### H1. Koyeb (API service)

In Koyeb → your API app → **Environment variables**:

| Variable | Value |
| --- | --- |
| `LIVEKIT_URL` | `wss://3dspace.tripjuchheim.com` |
| `LIVEKIT_API_KEY` | (from Part E2) |
| `LIVEKIT_API_SECRET` | (from Part E2) |

Save and **redeploy** the API.

### H2. Vercel (web)

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_LIVEKIT_URL` | `wss://3dspace.tripjuchheim.com` |

Redeploy the web app.

### H3. Verify API readiness

On your Mac:

```bash
curl -sS https://content-jeanine-juchheim-71a4f131.koyeb.app/ready
```

In the JSON, find the check named `livekit` — status should be **`ok`**.

---

## Part I — End-to-end browser test

1. Open your Vercel app in **Chrome**.
2. Sign in, create or join a room as teacher.
3. Open a **second browser** (or incognito) as student.
4. Open **Developer Tools** → **Network** → filter **WS**.
5. You should see a WebSocket to `wss://3dspace.tripjuchheim.com`.

Toggle camera/mic if you want to test media.

---

## Troubleshooting

### Caddy won't start

```bash
journalctl -u caddy -n 50 --no-pager
caddy validate --config /etc/caddy/Caddyfile
```

### LiveKit won't start

```bash
cd /opt/livekit
docker compose logs --tail=100
```

Common fixes: wrong `keys:` in `livekit.yaml`, typo in IP, YAML indentation.

### `curl https://3dspace.tripjuchheim.com` works but app won't connect

- Keys on Koyeb must match `livekit.yaml` **exactly**.
- `LIVEKIT_URL` must start with `wss://` (not `https://`).
- Redeploy API after env changes.

### Safari / school Wi‑Fi

Use `/debug/livekit-safari/[roomId]` on your deployed app. UDP/TURN must work (ports 3478, 5349, 50000–60000).

---

## Restart commands (later)

```bash
# LiveKit
cd /opt/livekit && docker compose restart

# Caddy
systemctl reload caddy
```

---

## Security notes (testing)

- LiveKit is bound to **127.0.0.1:7880** so the raw port is not exposed on the public internet; only Caddy on 443 is.
- Rotate API keys if you leak them.
- For production, consider disabling root SSH password login and using SSH keys only.
