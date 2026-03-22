/**
 * Lightning via Nostr Wallet Connect (NIP-47) using @getalby/sdk — works where Spark API is unreachable (e.g. some Railway networks).
 */
import { nwc } from "@getalby/sdk";
import { getNwcConnectionUrl } from "./nwc-config.js";
import type { InvoiceResult, PaymentResult, InvoiceStatus } from "./spark.js";

const { NWCClient } = nwc;

let clientInstance: InstanceType<typeof NWCClient> | null = null;
let initPromise: Promise<InstanceType<typeof NWCClient>> | null = null;

async function ensureClient(): Promise<InstanceType<typeof NWCClient>> {
  const url = getNwcConnectionUrl();
  if (!url) {
    throw new Error("NWC_URL is not set");
  }
  if (clientInstance) return clientInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const c = new NWCClient({ nostrWalletConnectUrl: url });
    clientInstance = c;
    return c;
  })();

  return initPromise;
}

/** NIP-47 balance is millisatoshis; Spark uses sats — normalize to whole sats. */
function msatsToSats(msats: number): number {
  return Math.max(0, Math.floor(msats / 1000));
}

/**
 * Create a BOLT11 invoice via NWC `make_invoice`.
 * `invoiceId` stored for polling is `payment_hash` (hex), not Spark’s UUID.
 */
export async function createInvoice(
  amountSats: number,
  memo = "Fund TipSats agent wallet",
): Promise<InvoiceResult> {
  const client = await ensureClient();
  const tx = await client.makeInvoice({
    amount: amountSats * 1000,
    description: memo,
    expiry: 86_400,
  });

  const expiresAt =
    typeof tx.expires_at === "number" && tx.expires_at > 0
      ? new Date(tx.expires_at * 1000).toISOString()
      : "";

  return {
    invoiceId: tx.payment_hash,
    bolt11: tx.invoice,
    amountSats,
    expiresAt,
  };
}

export async function getBalance(): Promise<number> {
  const client = await ensureClient();
  const { balance } = await client.getBalance();
  return msatsToSats(balance);
}

/** Human-readable routing / LN address for wallet UI when not using Spark. */
export async function getWalletDisplayAddress(): Promise<string> {
  const client = await ensureClient();
  const info = await client.getInfo();
  if (info.lud16) return info.lud16;
  const pk = info.pubkey;
  return pk ? `nwc:${pk.slice(0, 12)}…${pk.slice(-6)}` : "nwc";
}

export async function quotePayInvoice(_bolt11: string): Promise<number> {
  await ensureClient();
  return 0;
}

export async function payInvoice(
  bolt11: string,
  _maxFeeSats = 1000,
): Promise<PaymentResult> {
  const client = await ensureClient();
  console.log("[TipSats-NWC] Payment started");

  try {
    const result = await client.payInvoice({ invoice: bolt11 });
    const feesMsat = result.fees_paid ?? 0;
    const feeSats = Math.max(0, Math.ceil(feesMsat / 1000));
    const id = result.preimage?.slice(0, 32) || "nwc-paid";
    console.log(`[TipSats-NWC] pay_invoice preimage=${result.preimage?.slice(0, 16)}… fee≈${feeSats} sats`);
    return { id, fee: feeSats };
  } finally {
    console.log("[TipSats-NWC] Payment finished");
  }
}

export async function checkInvoiceStatus(paymentHash: string): Promise<InvoiceStatus> {
  const client = await ensureClient();
  try {
    const tx = await client.lookupInvoice({ payment_hash: paymentHash });
    if (tx.state === "settled") return "paid";
    if (tx.state === "failed") return "failed";
    const now = Math.floor(Date.now() / 1000);
    if (tx.expires_at > 0 && now > tx.expires_at) {
      return "expired";
    }
    return "pending";
  } catch {
    return "pending";
  }
}
