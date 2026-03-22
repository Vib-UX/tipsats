# Railway deployment

The `Dockerfile` lives at the **repository root** so the image can copy both `tipsats-backend/` and `test-harness-twdk-spark-ln/`.

**In Railway → Service → Settings:**

- **Root Directory:** leave **empty** (repo root). Do **not** set this to `tipsats-backend`, or the Docker build will fail with `test-harness-twdk-spark-ln: not found`.
- **Dockerfile path:** `Dockerfile` (default if `railway.json` is at repo root).

**Environment variables:** `WDK_SEED`, `CORS_ORIGIN` (e.g. `https://your-app.vercel.app`), `HEADLESS=true`, `PORT` (Railway usually sets this).

**Rumble / Cloudflare:** Rumble is behind Cloudflare; headless browsers on datacenter IPs usually **cannot** complete the challenge. The pipeline sets **`SKIP_RUMBLE=true`** when `HEADLESS=true` (unless you override `SKIP_RUMBLE`), and uses the **first address** in [`tipsats-backend/config/payouts.json`](tipsats-backend/config/payouts.json) as **`EXPECTED_ADDRESS`** so automation goes **Rumble → skipped**, **Boltz only**. For full Rumble UI locally, run with `HEADLESS=false` and `SKIP_RUMBLE=false`.

**USDT payout split:** After Boltz settles to the ERC-4337 agent, USDT is split **evenly** across every address in `payouts.json`. The harness prints `Payout addresses: 0x...,0x...` for the pipeline to parse; when that line is missing, the server falls back to the same JSON file. To add recipients or change order, edit `config/payouts.json` and redeploy.

Local build:

```bash
docker build -t tipsats-backend .
```
