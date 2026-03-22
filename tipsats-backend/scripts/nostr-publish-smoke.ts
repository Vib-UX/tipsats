/**
 * One-off kind-1 publish to verify NOSTR_PRIVATE_KEY or NWC_URL (secret=) + relays.
 *   cd tipsats-backend && npx tsx scripts/nostr-publish-smoke.ts
 */
import "dotenv/config";
import { publishTipNote } from "../src/lib/nostr-publish.js";
import type { TxDetails } from "../src/lib/types.js";

const mockTx: TxDetails = {
  swapId: "smoke",
  paymentId: "smoke",
  creator: "TipSats smoke test",
  creatorAddress: "0x0000000000000000000000000000000000000000",
  agentAddress: "0x0000000000000000000000000000000000000000",
  amountSats: "0",
  amountUsdt: "0",
  boltzUrl: "https://example.com",
};

const result = await publishTipNote({
  tx: mockTx,
  channels: [{ label: "Smoke", url: "https://example.com", description: "ok" }],
});

if ("nostrPublishError" in result) {
  console.error("Failed:", result.nostrPublishError);
  process.exit(1);
}

console.log("Published OK");
console.log("  event id:", result.nostrEventId);
console.log("  relay(s):", result.nostrRelayUrl);
console.log("  open:", result.nostrShareUrl);
