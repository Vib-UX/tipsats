# Railway deployment

The `Dockerfile` lives at the **repository root** so the image can copy both `tipsats-backend/` and `test-harness-twdk-spark-ln/`.

**In Railway → Service → Settings:**

- **Root Directory:** leave **empty** (repo root). Do **not** set this to `tipsats-backend`, or the Docker build will fail with `test-harness-twdk-spark-ln: not found`.
- **Dockerfile path:** `Dockerfile` (default if `railway.json` is at repo root).

**Environment variables:** `WDK_SEED`, `CORS_ORIGIN` (e.g. `https://your-app.vercel.app`), `HEADLESS=true`, `PORT` (Railway usually sets this).

Local build:

```bash
docker build -t tipsats-backend .
```
