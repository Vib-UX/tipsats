import "dotenv/config";
import express from "express";
import cors from "cors";
import walletRouter from "./routes/wallet.js";
import tipRouter from "./routes/tip.js";

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
  })
);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use("/api/wallet", walletRouter);
app.use("/api/tip", tipRouter);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[TipSats Backend] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[TipSats Backend] CORS origins: ${allowedOrigins.join(", ")}`);
  console.log(`[TipSats Backend] HEADLESS: ${process.env.HEADLESS ?? "false"}`);
});
