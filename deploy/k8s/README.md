# OpenClaw Kubernetes Deployment

This manifest mirrors the optimized runtime layout used by Docker Compose:

- `init-config` copies `openclaw.json` from secret to `/root/.openclaw` only if missing.
- Persistent data paths:
  - `/root/.openclaw` -> `openclaw-pvc`
  - `/root/root-data` -> `openclaw-root-pvc`
  - `/opt` and `/devops` -> `devops-shared-pvc`
- Exposed ports: `18789` and `1455`.

## Apply

```bash
kubectl apply -f deploy/k8s/openclaw.yaml
```

## Update Secret Config

Edit `stringData.openclaw.json` in `deploy/k8s/openclaw.yaml` and re-apply:

```bash
kubectl apply -f deploy/k8s/openclaw.yaml
kubectl rollout restart deployment/openclaw-native
```