import { Router, type Request, type Response } from "express";
import { getBalance, getAddress } from "../lib/lightning-wallet.js";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const [balance, address] = await Promise.all([getBalance(), getAddress()]);
    res.json({ balance, address });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch wallet info" });
  }
});

export default router;
