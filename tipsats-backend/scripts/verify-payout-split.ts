/**
 * Quick sanity check: load payouts.json and print a weighted split for a sample total.
 *   npx tsx scripts/verify-payout-split.ts [totalUsdt]
 */
import { loadPayoutConfig, splitWeightedUsdt } from "../src/lib/payout-config.js";

const total = process.argv[2] ?? "100.000000";
const cfg = loadPayoutConfig();
const parts = splitWeightedUsdt(total, cfg.addresses, cfg.splitWeights);
const sumMicro = parts.reduce((s, p) => s + Math.round(parseFloat(p.amountUsdt) * 1e6), 0);
const expectedMicro = Math.round(parseFloat(total) * 1e6);
console.log("Addresses:", cfg.addresses);
console.log("Weights:", cfg.splitWeights);
console.log("Split for", total, "USDT:");
for (let i = 0; i < parts.length; i++) {
  console.log(`  ${parts[i].address}  ${parts[i].amountUsdt}  (${cfg.channels[i]?.label ?? i})`);
}
console.log(
  "Sum (micro-USDT):",
  sumMicro,
  sumMicro === expectedMicro ? "OK" : `MISMATCH (expected ${expectedMicro})`
);
