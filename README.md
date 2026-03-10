# SmartLearn Claw (Native OpenClaw + Custom Tools)

This project runs in two layers:

1. Native OpenClaw (`openclaw-native`): original OpenClaw engine for skill orchestration.
2. SmartLearn Gateway (`openclaw`): custom program layer for auth, user/admin APIs, upload pipeline, and web bridge.

The PWA talks only to the gateway. The gateway forwards skill execution to native OpenClaw.
Gateway transport strategy: WebSocket first, then HTTP endpoint fallback when socket events are unavailable.

## Service Topology

```mermaid
graph TD
    U[Web/PWA User] --> G[SmartLearn Gateway :8000]
    U --> W[Independent Pages /chat /admin]
    G --> O[Native OpenClaw :18789 and :1455]
    G --> M[MongoDB]
    O --> T[Custom Tool Plugins (openclaw-plugins)]
    O --> M
```

## Optimized Deployment (Compose)

The Compose deployment is optimized to mirror your Kubernetes spec style:

- Native OpenClaw image: `harbor.dockerin.com/library/openclaw-ubuntu2404:v1.0.1`
- Exposes ports: `18789` and `1455`
- Persistent paths:
  - `/root/.openclaw` (named volume)
  - `/root/root-data` (bind-mounted root data dir)
  - `/opt` and `/devops` (shared named volume)
- Startup init logic:
  - If `/config/openclaw.json` exists and `/root/.openclaw/openclaw.json` is missing, copy once.
- Health checks and startup ordering for `db -> openclaw-native -> gateway -> pwa`.

## Quick Start

1. Copy env:

```bash
cp .env.example .env
```

2. (Optional but recommended) provide bootstrap config:

```bash
cp deploy/openclaw/config/openclaw.json.example deploy/openclaw/config/openclaw.json
```

3. Build and run:

```bash
docker compose up -d --build
```

4. Open pages:
- PWA login: http://localhost:3000/login
- Chat page: http://localhost:3000/chat
- Admin page: http://localhost:3000/admin
- Gateway health: http://localhost:8000/health
- Native OpenClaw ports: http://localhost:18789 and http://localhost:1455

5. Manual native OpenClaw setup (inside container):

```bash
docker exec -it smartlearn-openclaw-native bash
openclaw setup
```

The native container starts with `openclaw gateway --allow-unconfigured` by default for first boot.
After setup is complete, you can set `OPENCLAW_ALLOW_UNCONFIGURED=false` in `.env`.

## Native OpenClaw Mode

Use these envs:
- `OPENCLAW_NATIVE_IMAGE=harbor.dockerin.com/library/openclaw-ubuntu2404:v1.0.1`
- `OPENCLAW_NATIVE_PORT=18789`
- `OPENCLAW_NATIVE_ALT_PORT=1455`
- `OPENCLAW_ALLOW_UNCONFIGURED=true`
- `OPENCLAW_CONFIG_DIR=./deploy/openclaw/config`
- `OPENCLAW_ROOT_DATA_DIR=./deploy/openclaw/root`
- `SKILL_BACKEND=openclaw`
- `OPENCLAW_NATIVE_URL=http://openclaw-native:18789`

If native OpenClaw is temporarily unavailable, you can switch to local plugin execution:
- `SKILL_BACKEND=local`

## Kubernetes Manifests

A Kubernetes deployment aligned with your provided pattern is included at:

- `deploy/k8s/openclaw.yaml`

It includes Secret, PVCs, Deployment (`init-config` initContainer), and Service.

## Admin Access

By default, usernames in `ADMIN_USERNAMES` are assigned admin role at registration.
On startup, legacy users that match `ADMIN_USERNAMES` and have no role are auto-migrated to `admin`.

Example:
- `ADMIN_USERNAMES=admin,ops,teacher01`

## Qwen Model Config

- `LLM_PROVIDER=qwen`
- `QWEN_MODEL=qwen-plus`
- `QWEN_API_KEY=...`
- `QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`

## Core Endpoints (Gateway)

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `GET /admin/overview` (admin only)
- `GET /admin/users` (admin only)
- `POST /api/upload`
- `POST /api/skills/{skill_name}`
- `WS /socket.io` `trigger_skill`