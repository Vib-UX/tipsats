# Railway deployment

The `Dockerfile` lives at the **repository root** so the image can copy both `tipsats-backend/` and `test-harness-twdk-spark-ln/`.

**In Railway → Service → Settings:**

- **Root Directory:** leave **empty** (repo root). Do **not** set this to `tipsats-backend`, or the Docker build will fail with `test-harness-twdk-spark-ln: not found`.
- **Dockerfile path:** `Dockerfile` (default if `railway.json` is at repo root).

**Environment variables:** `CORS_ORIGIN` (e.g. `https://your-app.vercel.app`), `HEADLESS=true`, `PORT` (Railway usually sets this).

**Lightning (tips + Boltz payment):** If the Spark SDK cannot reach its API from Railway, set **`NWC_URL`** (Nostr Wallet Connect URI from Alby or any NIP-47 wallet). The backend uses **`@getalby/sdk`** for `make_invoice`, `pay_invoice`, and balance — same idea as [`test-harness-ln/lightning.ts`](test-harness-ln/lightning.ts). With **`NWC_URL`** set, **`LIGHTNING_BACKEND`** defaults to **NWC** (`auto` mode). You can still set **`WDK_SEED`** for Spark-only flows, or **`LIGHTNING_BACKEND=nwc`** / **`spark`** to force one backend. Polygon agent payouts still use **`WDK_SEED`** + **`PIMLICO_API_KEY`** for ERC-4337 unless you change that separately.

**Rumble / Cloudflare:** Rumble is behind Cloudflare; headless browsers on datacenter IPs usually **cannot** complete the challenge. The pipeline sets **`SKIP_RUMBLE=true`** when `HEADLESS=true` (unless you override `SKIP_RUMBLE`), and uses the **first address** in [`tipsats-backend/config/payouts.json`](tipsats-backend/config/payouts.json) as **`EXPECTED_ADDRESS`** so automation goes **Rumble → skipped**, **Boltz only**. For full Rumble UI locally, run with `HEADLESS=false` and `SKIP_RUMBLE=false`.

**USDT payout split:** After Boltz settles to the ERC-4337 agent, USDT is batched from the agent using **`splitWeights`** (e.g. `65, 35`) and **`channels`** (labels + Rumble URLs for Mission Control) in [`tipsats-backend/config/payouts.json`](tipsats-backend/config/payouts.json). Settlement always follows that file. With **`HEADLESS=false`** and **`SKIP_RUMBLE=false`**, the harness defaults to **`RUMBLE_SEARCH_DEMO=true`** (Bitcoin Ben → Simply Bitcoin flow); set **`RUMBLE_SEARCH_DEMO=false`** to force the legacy single-user path.

Local build:

```bash
docker build -t tipsats-backend .
```
