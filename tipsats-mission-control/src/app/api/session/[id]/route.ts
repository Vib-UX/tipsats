import { NextRequest, NextResponse } from "next/server";
import { getSession, setAgentAddress } from "@/lib/session-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const config = getSession(id);

  if (!config) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json(config);
}

// Agent reports its WDK wallet address back to the session
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  if (!body.address) {
    return NextResponse.json(
      { error: "address is required" },
      { status: 400 }
    );
  }

  const updated = setAgentAddress(id, body.address);
  if (!updated) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  console.log(`[TipSats] Agent wallet registered: ${body.address} (${id})`);
  return NextResponse.json({ ok: true, address: body.address });
}
