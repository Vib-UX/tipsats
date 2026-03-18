import { NextRequest, NextResponse } from "next/server";
import { generateSessionId, saveSession } from "@/lib/session-store";
import type { TipSatsConfig } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const sessionId = generateSessionId();

  const config: TipSatsConfig = {
    sessionId,
    weeklyBudgetUsd: body.weeklyBudgetUsd ?? 25,
    assets: body.assets ?? { btc: true, usdt: false, xaut: false },
    presets: body.presets ?? [],
    customRules: body.customRules ?? [],
    network: body.network ?? "testnet",
    electrumWsUrl:
      body.electrumWsUrl ?? "wss://electrum.blockstream.info:60004",
  };

  saveSession(config);
  console.log(`[TipSats] Session created: ${sessionId}`);

  return NextResponse.json({ sessionId });
}
