import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";
import { exec } from "child_process";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { sessionId } = await request.json();

  const config = getSession(sessionId);
  if (!config) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const missionControlUrl =
    process.env.MISSION_CONTROL_URL || "http://localhost:3000";

  const task = [
    `Start a TipSats tipping session.`,
    `Session ID: ${sessionId}`,
    `Fetch config from: ${missionControlUrl}/api/session/${sessionId}`,
    ``,
    `Instructions:`,
    `1. Fetch the session config from the URL above`,
    `2. Check your WDK wallet balance (getBalance, chain: bitcoin)`,
    `3. Get your wallet address (getAddress, chain: bitcoin)`,
    `4. Report your address: PUT ${missionControlUrl}/api/session/${sessionId} with { "address": "<your address>" }`,
    `5. Open the browser and navigate to https://rumble.com`,
    `6. Browse videos, apply the tipping rules from the config, and tip matching creators`,
    `7. Use the tipsats skill for detailed instructions on the browsing + tipping workflow`,
    `8. Stop when wallet balance is exhausted`,
  ].join("\n");

  const escaped = task.replace(/"/g, '\\"');
  const cmd = `openclaw message --agent tipsats "${escaped}"`;

  return new Promise<NextResponse>((resolve) => {
    const child = exec(cmd, {
      cwd: process.env.OPENCLAW_WORKSPACE || undefined,
      timeout: 10000,
    });

    const pid = child.pid;

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`[TipSats] Agent started for session ${sessionId}`);
        resolve(NextResponse.json({ ok: true, sessionId, pid }));
      } else {
        console.error(`[TipSats] Agent start failed with code ${code}`);
        resolve(
          NextResponse.json(
            { error: `openclaw exited with code ${code}` },
            { status: 500 }
          )
        );
      }
    });

    child.on("error", (err) => {
      console.error(`[TipSats] Agent start error:`, err);
      resolve(
        NextResponse.json({ error: err.message }, { status: 500 })
      );
    });

    setTimeout(() => {
      resolve(NextResponse.json({ ok: true, sessionId, pid, note: "async" }));
    }, 8000);
  });
}
