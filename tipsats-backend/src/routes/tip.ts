import { Router, type Request, type Response } from "express";
import { generateTipId, createTip, getTip, updateTipStatus, updateTipBalance } from "../lib/tip-store.js";
import { createInvoice, getBalance, checkInvoiceStatus } from "../lib/spark.js";
import { runPipeline, isRunning } from "../lib/pipeline.js";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const { presets = [], rules = [], budgetSats = 2000 } = req.body;

    if (budgetSats < 500 || budgetSats > 500_000) {
      res.status(400).json({ error: "Budget must be between 500 and 500,000 sats" });
      return;
    }

    const tipId = generateTipId();
    const invoice = await createInvoice(budgetSats, `TipSats agent fund — ${tipId}`);
    const balance = await getBalance();

    const session = createTip({
      id: tipId,
      presets,
      rules,
      budgetSats,
      invoiceBolt11: invoice.bolt11,
      invoiceId: invoice.invoiceId,
    });
    session.walletBalanceSats = balance;

    console.log(`[TipSats] Tip created: ${tipId} (${budgetSats} sats)`);

    res.json({
      tipId: session.id,
      bolt11: invoice.bolt11,
      amountSats: budgetSats,
      expiresAt: invoice.expiresAt,
      walletBalance: balance,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[TipSats] Error creating tip:", message);
    res.status(500).json({ error: message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const tip = getTip(id);

  if (!tip) {
    res.status(404).json({ error: "Tip not found" });
    return;
  }

  if (tip.status === "invoice_created") {
    try {
      const invoiceStatus = await checkInvoiceStatus(tip.invoiceId);
      if (invoiceStatus === "paid") {
        updateTipStatus(id, "funded");
        const balance = await getBalance();
        updateTipBalance(id, balance);
      }
    } catch {
      // Spark SDK may throw transiently; keep current status
    }
  }

  res.json(tip);
});

router.post("/:id/execute", async (req: Request, res: Response) => {
  const { id } = req.params;
  const tip = getTip(id);

  if (!tip) {
    res.status(404).json({ error: "Tip not found" });
    return;
  }

  if (tip.status !== "funded") {
    res.status(400).json({ error: `Cannot execute: status is ${tip.status}` });
    return;
  }

  if (isRunning(id)) {
    res.status(409).json({ error: "Pipeline already running" });
    return;
  }

  await new Promise((r) => setTimeout(r, 5000));

  const freshBalance = await getBalance();
  updateTipBalance(id, freshBalance);

  const tipSats = Math.min(tip.budgetSats, freshBalance);

  console.log(`[TipSats] Executing pipeline for ${id} (${tipSats} sats, balance: ${freshBalance} sats)`);
  runPipeline(id, tipSats);

  res.json({ ok: true, tipId: id, status: "agent_running" });
});

export default router;
