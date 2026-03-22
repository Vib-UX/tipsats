import "dotenv/config";
import { payInvoice, getBalance } from "../src/lib/lightning-wallet.js";

const bolt11 = process.argv[2];
if (!bolt11) {
  console.error("Usage: npx tsx scripts/pay-invoice-once.ts <bolt11>");
  process.exit(1);
}

(async () => {
  console.log("Balance before:", await getBalance(), "sats");
  const result = await payInvoice(bolt11.trim(), 1000);
  console.log("Payment result:", result);
  console.log("Balance after:", await getBalance(), "sats");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
