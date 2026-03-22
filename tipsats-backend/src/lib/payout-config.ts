import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { TransferRecipient } from "./evm4337.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = path.resolve(__dirname, "../../config/payouts.json");

export interface PayoutChannelMeta {
  label: string;
  url: string;
  /** Optional blurb included in the Nostr kind-1 note */
  description?: string;
}

export interface PayoutConfig {
  addresses: string[];
  /** Same length as addresses; should sum to 100 (e.g. 65, 35) */
  splitWeights: number[];
  /** Optional UI metadata per recipient index */
  channels: PayoutChannelMeta[];
}

/** Load full payout config (addresses, weights, channel links for UI). */
export function loadPayoutConfig(configPath = DEFAULT_CONFIG_PATH): PayoutConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (e: any) {
    throw new Error(`Failed to read payout config ${configPath}: ${e.message}`);
  }
  const obj = raw as {
    payoutAddresses?: unknown;
    splitWeights?: unknown;
    channels?: unknown;
  };
  const list = obj.payoutAddresses;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("payouts.json: payoutAddresses must be a non-empty array");
  }
  for (const a of list) {
    if (typeof a !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(a)) {
      throw new Error(`payouts.json: invalid address ${String(a)}`);
    }
  }
  const addresses = list as string[];
  const n = addresses.length;

  let splitWeights: number[];
  if (Array.isArray(obj.splitWeights) && obj.splitWeights.length === n) {
    splitWeights = obj.splitWeights.map((w) => Number(w));
    if (splitWeights.some((w) => !Number.isFinite(w) || w < 0)) {
      throw new Error("payouts.json: splitWeights must be non-negative numbers");
    }
    const sum = splitWeights.reduce((a, b) => a + b, 0);
    if (sum <= 0) throw new Error("payouts.json: splitWeights must sum to > 0");
  } else {
    splitWeights = Array(n).fill(1);
  }

  let channels: PayoutChannelMeta[] = [];
  if (Array.isArray(obj.channels)) {
    for (const c of obj.channels) {
      if (!c || typeof c !== "object") continue;
      const ch = c as { label?: unknown; url?: unknown; description?: unknown };
      if (typeof ch.label === "string" && typeof ch.url === "string") {
        const meta: PayoutChannelMeta = { label: ch.label, url: ch.url };
        if (typeof ch.description === "string" && ch.description.trim()) {
          meta.description = ch.description.trim();
        }
        channels.push(meta);
      }
    }
  }
  while (channels.length < n) {
    channels.push({ label: `Recipient ${channels.length + 1}`, url: "" });
  }
  channels = channels.slice(0, n);

  return { addresses, splitWeights, channels };
}

/** @deprecated use loadPayoutConfig */
export function loadPayoutAddresses(configPath = DEFAULT_CONFIG_PATH): string[] {
  return loadPayoutConfig(configPath).addresses;
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

/**
 * Batch settlement always uses **committed config** (weights + addresses + channel labels).
 * Harness line is informational only.
 */
export function resolvePayoutAddresses(_harnessOutput: string): string[] {
  return loadPayoutConfig().addresses;
}

/** Split total USDT evenly in 6-decimal micro units (sum of amounts equals total). */
export function splitEvenUsdt(totalUsdtStr: string, addresses: string[]): TransferRecipient[] {
  const n = addresses.length;
  if (n === 0) throw new Error("splitEvenUsdt: no addresses");
  const weights = Array(n).fill(1);
  return splitWeightedUsdt(totalUsdtStr, addresses, weights);
}

/**
 * Weighted split (e.g. 65% / 35%). `weights` same length as `addresses`; sum can be any positive number.
 */
export function splitWeightedUsdt(
  totalUsdtStr: string,
  addresses: string[],
  weights: number[]
): TransferRecipient[] {
  const n = addresses.length;
  if (n === 0) throw new Error("splitWeightedUsdt: no addresses");
  if (weights.length !== n) {
    throw new Error(`splitWeightedUsdt: need ${n} weights, got ${weights.length}`);
  }
  const total = parseFloat(totalUsdtStr);
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error(`splitWeightedUsdt: invalid total "${totalUsdtStr}"`);
  }
  const totalMicro = Math.round(total * 1e6);
  if (totalMicro <= 0) throw new Error("splitWeightedUsdt: amount too small after rounding");

  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) throw new Error("splitWeightedUsdt: weights must sum to > 0");

  const partsMicro = weights.map((w) => Math.floor((totalMicro * w) / sumW));
  const rem = totalMicro - partsMicro.reduce((a, b) => a + b, 0);
  if (partsMicro.length > 0) partsMicro[partsMicro.length - 1] += rem;

  return addresses.map((address, i) => ({
    address,
    amountUsdt: (partsMicro[i] / 1e6).toFixed(6),
  }));
}
