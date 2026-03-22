/**
 * Quick sanity check: load payouts.json and print an even split for a sample total.
 *   npx tsx scripts/verify-payout-split.ts [totalUsdt]
 */
import { loadPayoutAddresses, splitEvenUsdt } from "../src/lib/payout-config.js";

const total = process.argv[2] ?? "1.234567";
const addrs = loadPayoutAddresses();
const parts = splitEvenUsdt(total, addrs);
const sumMicro = parts.reduce((s, p) => s + Math.round(parseFloat(p.amountUsdt) * 1e6), 0);
const expectedMicro = Math.round(parseFloat(total) * 1e6);
console.log("Addresses:", addrs);
console.log("Split for", total, "USDT:");
for (const p of parts) console.log(`  ${p.address}  ${p.amountUsdt}`);
console.log(
  "Sum (micro-USDT):",
  sumMicro,
  sumMicro === expectedMicro ? "OK" : `MISMATCH (expected ${expectedMicro})`
);
