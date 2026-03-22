/**
 * Distribute almost all agent USDT using config weights (e.g. 65/35) from payouts.json
 * (same fee buffer logic as pipeline.ts).
 *
 *   cd tipsats-backend && npx tsx scripts/payout-agent-balance.ts
 */
import "dotenv/config";
import { getUsdtBalance, quoteBatchTransfer, batchTransferUsdt } from "../src/lib/evm4337.js";
import { loadPayoutConfig, splitWeightedUsdt } from "../src/lib/payout-config.js";

async function main() {
  const balanceStr = await getUsdtBalance();
  const balanceNum = parseFloat(balanceStr);
  const cfg = loadPayoutConfig();
  const { addresses, splitWeights } = cfg;

  console.log(`Agent USDT balance: ${balanceStr}`);
  console.log(`Payout addresses (${addresses.length}):`, addresses.join(", "));
  console.log(`Weights:`, splitWeights.join(" / "));

  let feeUsdt = 0.1;
  try {
    const provisional = Math.max(0, balanceNum - 0.15).toFixed(6);
    const quoteRecipients = splitWeightedUsdt(provisional, addresses, splitWeights);
    const feeRaw = await quoteBatchTransfer(quoteRecipients);
    feeUsdt = Number(feeRaw) / 1e6;
    console.log(`Estimated paymaster fee: ~${feeUsdt} USDT (raw ${feeRaw})`);
  } catch (e: any) {
    console.log(`Fee quote failed, using default 0.1 USDT: ${e.message}`);
  }

  const sendAmount = Math.max(0, balanceNum - feeUsdt - 0.01).toFixed(6);
  console.log(`Sending (after fee + 0.01 buffer): ${sendAmount} USDT total`);

  if (parseFloat(sendAmount) <= 0) {
    throw new Error("Balance too low after reserving gas");
  }

  const batchRecipients = splitWeightedUsdt(sendAmount, addresses, splitWeights);
  for (const r of batchRecipients) {
    console.log(`  -> ${r.address}: ${r.amountUsdt} USDT`);
  }

  const result = await batchTransferUsdt(batchRecipients);
  console.log("Done:", result);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
