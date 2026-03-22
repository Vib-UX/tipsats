import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { TransferRecipient } from "./evm4337.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = path.resolve(__dirname, "../../config/payouts.json");

/** Load payout Polygon addresses from committed config (tipsats-backend/config/payouts.json). */
export function loadPayoutAddresses(configPath = DEFAULT_CONFIG_PATH): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (e: any) {
    throw new Error(`Failed to read payout config ${configPath}: ${e.message}`);
  }
  const list = (raw as { payoutAddresses?: unknown }).payoutAddresses;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("payouts.json: payoutAddresses must be a non-empty array");
  }
  for (const a of list) {
    if (typeof a !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(a)) {
      throw new Error(`payouts.json: invalid address ${String(a)}`);
    }
  }
  return list as string[];
}

/**
 * Parse `Payout addresses: 0x...,0x...` from harness stdout.
 * Returns null if missing or any token is not a valid 0x address.
 */
export function parsePayoutAddressesFromHarnessOutput(output: string): string[] | null {
  const m = output.match(/Payout addresses:\s*([^\r\n]+)/i);
  if (!m) return null;
  const parts = m[1].split(",").map((s) => s.trim()).filter(Boolean);
  const valid: string[] = [];
  for (const p of parts) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(p)) return null;
    valid.push(p);
  }
  return valid.length > 0 ? valid : null;
}

/** Prefer harness line; fall back to config file. */
export function resolvePayoutAddresses(harnessOutput: string): string[] {
  const parsed = parsePayoutAddressesFromHarnessOutput(harnessOutput);
  if (parsed) return parsed;
  return loadPayoutAddresses();
}

/** Split total USDT evenly in 6-decimal micro units (sum of amounts equals total). */
export function splitEvenUsdt(totalUsdtStr: string, addresses: string[]): TransferRecipient[] {
  const n = addresses.length;
  if (n === 0) throw new Error("splitEvenUsdt: no addresses");
  const total = parseFloat(totalUsdtStr);
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error(`splitEvenUsdt: invalid total "${totalUsdtStr}"`);
  }
  const totalMicro = Math.round(total * 1e6);
  if (totalMicro <= 0) throw new Error("splitEvenUsdt: amount too small after rounding");
  const base = Math.floor(totalMicro / n);
  const rem = totalMicro - base * n;
  return addresses.map((address, i) => {
    const micro = base + (i < rem ? 1 : 0);
    return { address, amountUsdt: (micro / 1e6).toFixed(6) };
  });
}
