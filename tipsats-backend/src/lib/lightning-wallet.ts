/**
 * Unified Lightning layer: Spark (WDK) or NWC (@getalby/sdk).
 *
 * - `LIGHTNING_BACKEND=auto` (default): use **NWC** when `NWC_URL` is set (Railway-friendly), else Spark when `WDK_SEED` is set.
 * - `LIGHTNING_BACKEND=nwc` | `spark`: force one backend.
 */
import { isNwcConfigured } from "./nwc-config.js";
import * as spark from "./spark.js";
import * as nwcLightning from "./nwc-lightning.js";
import type { InvoiceResult, PaymentResult, InvoiceStatus } from "./spark.js";

export type { InvoiceResult, PaymentResult, InvoiceStatus };

function hasSpark(): boolean {
  return Boolean(process.env.WDK_SEED?.trim());
}

export type LightningBackend = "nwc" | "spark";

export function resolveLightningBackend(): LightningBackend {
  const raw = process.env.LIGHTNING_BACKEND?.trim().toLowerCase();
  if (raw === "nwc") {
    if (!isNwcConfigured()) {
      throw new Error("LIGHTNING_BACKEND=nwc requires NWC_URL");
    }
    return "nwc";
  }
  if (raw === "spark") {
    if (!hasSpark()) {
      throw new Error("LIGHTNING_BACKEND=spark requires WDK_SEED");
    }
    return "spark";
  }
  if (isNwcConfigured()) return "nwc";
  if (hasSpark()) return "spark";
  throw new Error("Configure Lightning: set NWC_URL (NWC) and/or WDK_SEED (Spark)");
}

export async function createInvoice(
  amountSats: number,
  memo?: string,
): Promise<InvoiceResult> {
  const b = resolveLightningBackend();
  if (b === "nwc") return nwcLightning.createInvoice(amountSats, memo);
  return spark.createInvoice(amountSats, memo);
}

export async function getBalance(): Promise<number> {
  const b = resolveLightningBackend();
  if (b === "nwc") return nwcLightning.getBalance();
  return spark.getBalance();
}

export async function getAddress(): Promise<string> {
  const b = resolveLightningBackend();
  if (b === "nwc") return nwcLightning.getWalletDisplayAddress();
  return spark.getAddress();
}

export async function quotePayInvoice(bolt11: string): Promise<number> {
  const b = resolveLightningBackend();
  if (b === "nwc") return nwcLightning.quotePayInvoice(bolt11);
  return spark.quotePayInvoice(bolt11);
}

export async function payInvoice(
  bolt11: string,
  maxFeeSats = 1000,
): Promise<PaymentResult> {
  const b = resolveLightningBackend();
  if (b === "nwc") return nwcLightning.payInvoice(bolt11, maxFeeSats);
  return spark.payInvoice(bolt11, maxFeeSats);
}

export async function checkInvoiceStatus(invoiceId: string): Promise<InvoiceStatus> {
  const b = resolveLightningBackend();
  if (b === "nwc") return nwcLightning.checkInvoiceStatus(invoiceId);
  return spark.checkInvoiceStatus(invoiceId);
}
