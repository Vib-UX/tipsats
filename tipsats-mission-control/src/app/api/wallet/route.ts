import { NextResponse } from "next/server";
import { getBalance, getAddress } from "@/lib/spark";

export async function GET() {
  try {
    const [balance, address] = await Promise.all([getBalance(), getAddress()]);
    return NextResponse.json({ balance, address });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch wallet info" },
      { status: 500 }
    );
  }
}
