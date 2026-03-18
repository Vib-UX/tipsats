import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { sessionId } = await request.json();

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId is required" },
      { status: 400 }
    );
  }

  const escaped = `Stop the TipSats session ${sessionId}. Withdraw any remaining funds if a return address was configured, then end the session.`;

  return new Promise<NextResponse>((resolve) => {
    exec(
      `openclaw message --agent tipsats "${escaped}"`,
      { timeout: 10000 },
      (err) => {
        if (err) {
          console.error(`[TipSats] Agent stop error:`, err);
          resolve(
            NextResponse.json({ error: err.message }, { status: 500 })
          );
        } else {
          console.log(`[TipSats] Stop sent for session ${sessionId}`);
          resolve(NextResponse.json({ ok: true, sessionId }));
        }
      }
    );
  });
}
