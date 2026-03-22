import "dotenv/config";
import express from "express";
import cors from "cors";
import walletRouter from "./routes/wallet.js";
import tipRouter from "./routes/tip.js";
import agentRouter from "./routes/agent.js";
import { getNwcPublicMeta, isNwcConfigured } from "./lib/nwc-config.js";

const app = express();
const PORT = Number(process.env.PORT) || 8080;

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Blocked request from: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use("/api/wallet", walletRouter);
app.use("/api/tip", tipRouter);
app.use("/api/agent", agentRouter);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[TipSats Backend] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[TipSats Backend] CORS origins: ${allowedOrigins.join(", ")}`);
  console.log(`[TipSats Backend] HEADLESS: ${process.env.HEADLESS ?? "false"}`);
  if (isNwcConfigured()) {
    const { walletPubkeyHex, relayUrl } = getNwcPublicMeta();
    const pk = walletPubkeyHex
      ? `${walletPubkeyHex.slice(0, 12)}…${walletPubkeyHex.slice(-8)}`
      : "(parse pubkey)";
    const relay = relayUrl ?? "(relay from URI)";
    console.log(
      `[TipSats Backend] NWC: loaded (NIP-47 — future zaps NIP-57) wallet ${pk} relay ${relay}`,
    );
  } else {
    console.log(
      `[TipSats Backend] NWC: not set (set NWC_URL for Lightning + future zap flows)`,
    );
  }
});
