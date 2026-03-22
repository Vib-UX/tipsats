import { Router, type Request, type Response } from "express";
import { getAgentAddress, getUsdtBalance, batchTransferUsdt, quoteBatchTransfer } from "../lib/evm4337.js";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const [address, usdtBalance] = await Promise.all([
      getAgentAddress(),
      getUsdtBalance(),
    ]);
    res.json({ address, usdtBalance });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch agent info" });
  }
});

router.post("/batch", async (req: Request, res: Response) => {
  try {
    const { recipients } = req.body;
    if (!Array.isArray(recipients) || !recipients.length) {
      res.status(400).json({ error: "recipients array is required" });
      return;
    }
    for (const r of recipients) {
      if (!r.address || !r.amountUsdt) {
        res.status(400).json({ error: "Each recipient needs address and amountUsdt" });
        return;
      }
    }
    const result = await batchTransferUsdt(recipients);
    res.json(result);
  } catch (err: any) {
    console.error("[TipSats-4337] Batch transfer failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/quote", async (req: Request, res: Response) => {
  try {
    const { recipients } = req.body;
    if (!Array.isArray(recipients) || !recipients.length) {
      res.status(400).json({ error: "recipients array is required" });
      return;
    }
    const fee = await quoteBatchTransfer(recipients);
    res.json({ fee });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
