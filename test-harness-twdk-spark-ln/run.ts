import "dotenv/config";
import { launchBrowser } from "./browser.js";
import { extractCreatorAddress } from "./rumble.js";
import { createBoltzSwap } from "./boltz.js";
import { initSpark, payInvoice, quotePayInvoice } from "./lightning.js";

const DRY_RUN = process.env.DRY_RUN !== "false";
const RUMBLE_USER = process.env.RUMBLE_USER || "crypto_vib";
const TIP_AMOUNT_SATS = parseInt(process.env.TIP_AMOUNT_SATS || "0", 10);
const TIP_AMOUNT_USD = parseFloat(process.env.TIP_AMOUNT_USD || "1.00");
const WDK_SEED = process.env.WDK_SEED || "";
const EXPECTED_ADDRESS = process.env.EXPECTED_ADDRESS || "";

function log(msg: string) {
  console.log(`[TipSats-Spark] ${msg}`);
}

function logStep(step: number, msg: string) {
  console.log(`\n[TipSats-Spark] ══════ Step ${step} ══════`);
  console.log(`[TipSats-Spark] ${msg}`);
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║     TipSats WDK Spark Lightning Test Harness         ║");
  console.log("║     Rumble → Boltz → Spark payLightningInvoice        ║");
  console.log(`║     Mode: ${DRY_RUN ? "DRY RUN (no payment)" : "WET RUN (paying invoice!)"}              ║`);
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // ── Step 1: Init WDK Spark wallet ──
  logStep(1, "Initializing WDK Spark wallet...");

  let spark: Awaited<ReturnType<typeof initSpark>> | null = null;

  if (WDK_SEED) {
    try {
      spark = await initSpark(WDK_SEED);
      log(`  Spark address: ${spark.address}`);
      log(`  Balance: ${spark.balanceSats} sats`);
    } catch (err: any) {
      log(`  Spark init failed: ${err.message}`);
      log("  Continuing without wallet (invoice-only mode)...");
    }
  } else {
    log("  No WDK_SEED set. Will extract invoice only (no payment).");
    log("  Set WDK_SEED in .env to enable Lightning payments.");
  }

  // ── Step 2: Launch browser ──
  logStep(2, "Launching browser...");
  const { context, page } = await launchBrowser();
  log("  Browser launched (persistent Chrome profile + clipboard permissions)");

  try {
    // ── Step 3: Rumble flow → extract creator address ──
    logStep(3, `Extracting creator address from Rumble (${RUMBLE_USER})...`);

    const creatorAddress = await extractCreatorAddress(
      page,
      RUMBLE_USER,
      EXPECTED_ADDRESS,
      log
    );

    log(`  Creator: ${RUMBLE_USER}`);
    log(`  Address: ${creatorAddress}`);

    // ── Step 4: Boltz swap → Lightning invoice ──
    const swapSats = TIP_AMOUNT_SATS > 0 ? TIP_AMOUNT_SATS : Math.round(TIP_AMOUNT_USD * 1500);
    logStep(4, `Creating Boltz swap: ${swapSats} sats → USDT...`);

    const { swapId, bolt11, satsAmount, usdtAmount } = await createBoltzSwap(
      context,
      creatorAddress,
      swapSats,
      log
    );

    // ── Step 5: Display invoice ──
    logStep(5, "Lightning Invoice");
    console.log("");
    console.log("┌─────────────────────────────────────────────────────┐");
    console.log("│  LIGHTNING INVOICE                                  │");
    console.log("├─────────────────────────────────────────────────────┤");
    console.log(`│  Swap ID:  ${swapId}`);
    console.log(`│  Amount:   ~${satsAmount} sats (~${usdtAmount} USDT)`);
    console.log(`│  To:       ${creatorAddress} (Polygon)`);
    console.log(`│  Creator:  ${RUMBLE_USER}`);
    console.log("├─────────────────────────────────────────────────────┤");
    console.log(`│  ${bolt11}`);
    console.log("└─────────────────────────────────────────────────────┘");
    console.log("");

    // ── Step 6: Pay via WDK Spark (if wet run + wallet available) ──
    if (!DRY_RUN && spark) {
      logStep(6, "Paying Lightning invoice via WDK Spark...");

      const invoiceSats = parseInt(satsAmount.replace(/\s/g, ""), 10) || swapSats;
      if (spark.balanceSats < invoiceSats) {
        throw new Error(
          `Insufficient balance: ${spark.balanceSats} sats < ${invoiceSats} sats required`
        );
      }

      // Fee quote
      try {
        const feeEstimate = await quotePayInvoice(spark.account, bolt11);
        log(`  Fee estimate: ${feeEstimate} sats`);
      } catch {
        log("  Fee estimate unavailable, proceeding...");
      }

      log(`  Sending payment (~${satsAmount} sats)...`);
      const result = await payInvoice(spark.account, bolt11);
      log(`  Payment successful!`);
      log(`  Payment ID: ${result.id}`);
      log(`  Fee: ${result.fee} sats`);
    } else if (!DRY_RUN && !spark) {
      log("  Payment will be handled externally (Mission Control Spark wallet).");
    } else {
      log(`  DRY RUN -- invoice extracted but not paid.`);
      log(`  Run with DRY_RUN=false to pay via WDK Spark.`);
    }

    // ── Summary ──
    console.log("\n╔══════════════════════════════════════════════════════╗");
    console.log("║     Run Complete                                     ║");
    console.log("╚══════════════════════════════════════════════════════════╝");
    log(`Creator:    ${RUMBLE_USER}`);
    log(`Address:    ${creatorAddress}`);
    log(`Amount:     ${satsAmount} sats (~${usdtAmount} USDT)`);
    log(`Swap ID:    ${swapId}`);
    log(`Mode:       ${DRY_RUN ? "DRY RUN" : "PAID"}`);
    log(`Invoice:    ${bolt11.slice(0, 40)}...`);
    if (spark) {
      log(`Spark addr: ${spark.address}`);
    }
  } catch (err: any) {
    log(`\n  Error: ${err.message}`);
    log("  Check debug screenshots (debug-*.png) for UI state.");
    process.exitCode = 1;
  } finally {
    if (spark) {
      try { spark.wallet.dispose(); } catch {}
    }
    if (process.env.KEEP_BROWSER_OPEN === "true") {
      log("\nBrowser left open for inspection.");
    } else {
      log("\nClosing browser in 5s (inspect if needed)...");
      await new Promise((r) => setTimeout(r, 5000));
      await context.close();
    }
  }
}

main();
