import { NextRequest, NextResponse } from "next/server";
import { getTip, updateTipStatus, updateTipBalance } from "@/lib/tip-store";
import { checkInvoiceStatus, getBalance } from "@/lib/spark";
import { runPipeline, isRunning } from "@/lib/pipeline";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tip = getTip(id);

  if (!tip) {
    return NextResponse.json({ error: "Tip not found" }, { status: 404 });
  }

  // If waiting for payment, check invoice status
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

  return NextResponse.json(tip);
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tip = getTip(id);

  if (!tip) {
    return NextResponse.json({ error: "Tip not found" }, { status: 404 });
  }

  if (tip.status !== "funded") {
    return NextResponse.json(
      { error: `Cannot execute: status is ${tip.status}` },
      { status: 400 }
    );
  }

  if (isRunning(id)) {
    return NextResponse.json(
      { error: "Pipeline already running" },
      { status: 409 }
    );
  }

  // Wait for balance to settle after Lightning payment
  await new Promise((r) => setTimeout(r, 5000));

  const freshBalance = await getBalance();
  updateTipBalance(id, freshBalance);

  // Pass the actual sats budget to the pipeline — Boltz will calculate the USDT.
  // Use the funded budget amount (not the full balance) to keep it predictable.
  const tipSats = Math.min(tip.budgetSats, freshBalance);

  console.log(`[TipSats] Executing pipeline for ${id} (${tipSats} sats, balance: ${freshBalance} sats)`);
  runPipeline(id, tipSats);

  return NextResponse.json({ ok: true, tipId: id, status: "agent_running" });
}
