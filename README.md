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
    G --> O[Native OpenClaw :18789 host and internal]
    G --> M[MongoDB]
    O --> T[Custom Tool Plugins (openclaw-plugins)]
    O --> M
```

## What You Get

- Native OpenClaw execution path.
- Independent chat page: `/chat`
- Independent admin page: `/admin`
- Main student console: `/dashboard`

## Quick Start

1. Copy env:

```bash
cp .env.example .env
```

2. Adjust `.env` values if needed (especially `QWEN_API_KEY` and auth secrets).

3. Build and run:

```bash
docker compose up -d --build
```

4. Open pages:
- PWA login: http://localhost:3000/login
- Chat page: http://localhost:3000/chat
- Admin page: http://localhost:3000/admin
- Gateway health: http://localhost:8000/health
- Native OpenClaw (host mapped): http://localhost:18789

5. Manual native OpenClaw setup (inside container):

```bash
docker exec -it smartlearn-openclaw-native bash
```

Then follow your own process to configure DingTalk and model provider inside `/root/.openclaw`.
This directory is persisted by Docker volume `openclaw-home`, so settings survive container restarts.

## Native OpenClaw Mode

Use these envs:
- `OPENCLAW_NATIVE_IMAGE=harbor.dockerin.com/library/openclaw-ubuntu2404:v1.0.1`
- `OPENCLAW_NATIVE_PORT=18789`
- `SKILL_BACKEND=openclaw`
- `OPENCLAW_NATIVE_URL=http://openclaw-native:18789`

If native OpenClaw is temporarily unavailable, you can switch to local plugin execution:
- `SKILL_BACKEND=local`

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
