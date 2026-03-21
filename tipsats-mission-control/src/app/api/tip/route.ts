import { NextRequest, NextResponse } from "next/server";
import { generateTipId, createTip } from "@/lib/tip-store";
import { createInvoice, getBalance } from "@/lib/spark";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { presets = [], rules = [], budgetSats = 2000 } = body;

    if (budgetSats < 500 || budgetSats > 500_000) {
      return NextResponse.json(
        { error: "Budget must be between 500 and 500,000 sats" },
        { status: 400 }
      );
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

    return NextResponse.json({
      tipId: session.id,
      bolt11: invoice.bolt11,
      amountSats: budgetSats,
      expiresAt: invoice.expiresAt,
      walletBalance: balance,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[TipSats] Error creating tip:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
