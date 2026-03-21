import "dotenv/config";
import { launchBrowser } from "./browser.js";
import { extractCreatorAddress } from "./rumble.js";
import { createBoltzSwap } from "./boltz.js";
import { initNwc, payInvoice } from "./lightning.js";

const DRY_RUN = process.env.DRY_RUN !== "false";
const RUMBLE_USER = process.env.RUMBLE_USER || "crypto_vib";
const TIP_AMOUNT = parseFloat(process.env.TIP_AMOUNT_USD || "1.00");
const NWC_URL = process.env.NWC_URL || "";
const EXPECTED_ADDRESS = process.env.EXPECTED_ADDRESS || "";

function log(msg: string) {
  console.log(`[TipSats-LN] ${msg}`);
}

function logStep(step: number, msg: string) {
  console.log(`\n[TipSats-LN] ══════ Step ${step} ══════`);
  console.log(`[TipSats-LN] ${msg}`);
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║     TipSats Lightning Test Harness               ║");
  console.log("║     Rumble → Boltz → Lightning Invoice Flow       ║");
  console.log(`║     Mode: ${DRY_RUN ? "DRY RUN (no payment)" : "WET RUN (paying invoice!)"}            ║`);
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // ── Step 1: Init Lightning wallet (Alby NWC) ──
  logStep(1, "Initializing Lightning wallet (Alby NWC)...");

  let nwcWallet: Awaited<ReturnType<typeof initNwc>> | null = null;

  if (NWC_URL) {
    try {
      nwcWallet = await initNwc(NWC_URL);
      log(`  NWC connected`);
      log(`  Balance: ${nwcWallet.balanceSats} sats`);
    } catch (err: any) {
      log(`  NWC init failed: ${err.message}`);
      log("  Continuing without NWC (invoice-only mode)...");
    }
  } else {
    log("  No NWC_URL set. Will extract invoice only (no payment).");
    log("  Set NWC_URL in .env to enable Lightning payments.");
  }

  // ── Step 2: Launch browser ──
  logStep(2, "Launching browser...");
  const { context, page } = await launchBrowser();
  log("  Browser launched (persistent Chrome profile + clipboard permissions)");

  try {
    // ── Step 3-7: Rumble flow → extract creator address ──
    logStep(3, `Extracting creator address from Rumble (${RUMBLE_USER})...`);

    const creatorAddress = await extractCreatorAddress(
      page,
      RUMBLE_USER,
      EXPECTED_ADDRESS,
      log
    );

    log(`  Creator: ${RUMBLE_USER}`);
    log(`  Address: ${creatorAddress}`);

    // ── Step 8: Boltz swap → Lightning invoice ──
    logStep(4, `Creating Boltz swap: ${TIP_AMOUNT} USDT → Lightning...`);

    const { swapId, bolt11, satsAmount } = await createBoltzSwap(
      context,
      creatorAddress,
      TIP_AMOUNT,
      log
    );

    // ── Step 9: Display invoice ──
    logStep(5, "Lightning Invoice");
    console.log("");
    console.log("┌─────────────────────────────────────────────────────┐");
    console.log("│  LIGHTNING INVOICE                                  │");
    console.log("├─────────────────────────────────────────────────────┤");
    console.log(`│  Swap ID:  ${swapId}`);
    console.log(`│  Amount:   ~${satsAmount} sats (~${TIP_AMOUNT} USDT)`);
    console.log(`│  To:       ${creatorAddress} (Polygon)`);
    console.log(`│  Creator:  ${RUMBLE_USER}`);
    console.log("├─────────────────────────────────────────────────────┤");
    console.log(`│  ${bolt11}`);
    console.log("└─────────────────────────────────────────────────────┘");
    console.log("");

    // ── Step 10: Pay (if wet run + NWC available) ──
    if (!DRY_RUN && nwcWallet) {
      logStep(6, "Paying Lightning invoice via NWC...");

      const satsNum = parseInt(satsAmount.replace(/\s/g, ""), 10);
      if (nwcWallet.balanceSats < satsNum) {
        throw new Error(
          `Insufficient balance: ${nwcWallet.balanceSats} sats < ${satsNum} sats required`
        );
      }

      log(`  Sending payment (~${satsAmount} sats)...`);
      const result = await payInvoice(nwcWallet.client, bolt11);
      log(`  Payment successful!`);
      log(`  Preimage: ${result.preimage}`);
      log(`  Fees paid: ${result.feesPaid} msats`);
    } else if (!DRY_RUN && !nwcWallet) {
      log("  WET RUN requested but no NWC wallet available.");
      log("  Set NWC_URL in .env to enable payment.");
    } else {
      log(`  DRY RUN -- invoice extracted but not paid.`);
      log(`  Run with DRY_RUN=false to pay via Lightning.`);
    }

    // ── Summary ──
    console.log("\n╔══════════════════════════════════════════════════╗");
    console.log("║     Run Complete                                 ║");
    console.log("╚══════════════════════════════════════════════════════╝");
    log(`Creator:    ${RUMBLE_USER}`);
    log(`Address:    ${creatorAddress}`);
    log(`Amount:     ${TIP_AMOUNT} USDT (~${satsAmount} sats)`);
    log(`Swap ID:    ${swapId}`);
    log(`Mode:       ${DRY_RUN ? "DRY RUN" : "PAID"}`);
    log(`Invoice:    ${bolt11.slice(0, 40)}...`);

  } catch (err: any) {
    log(`\n  Error: ${err.message}`);
    log("  Check debug screenshots (debug-*.png) for UI state.");
    process.exitCode = 1;
  } finally {
    log("\nClosing browser in 5s (inspect if needed)...");
    await new Promise((r) => setTimeout(r, 5000));
    await context.close();
  }
}

main();
