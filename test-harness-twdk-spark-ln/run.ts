import "dotenv/config";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { launchBrowser } from "./browser.js";
import { extractCreatorAddress } from "./rumble.js";
import { createBoltzSwap } from "./boltz.js";
import { initSpark, payInvoice, quotePayInvoice } from "./lightning.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Same file as tipsats-backend (repo root layout). Pipeline parses this line for payout split. */
function loadPayoutAddressesFromConfig(): string[] {
  const configPath = path.resolve(__dirname, "../tipsats-backend/config/payouts.json");
  const raw = JSON.parse(readFileSync(configPath, "utf8")) as { payoutAddresses?: unknown };
  const list = raw.payoutAddresses;
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

const DRY_RUN = process.env.DRY_RUN !== "false";
const RUMBLE_USER = process.env.RUMBLE_USER || "crypto_vib";
const TIP_AMOUNT_SATS = parseInt(process.env.TIP_AMOUNT_SATS || "0", 10);
const TIP_AMOUNT_USD = parseFloat(process.env.TIP_AMOUNT_USD || "1.00");
const WDK_SEED = process.env.WDK_SEED || "";
const EXPECTED_ADDRESS = process.env.EXPECTED_ADDRESS || "";
/** Override Boltz receive address (e.g. agent 4337 wallet instead of creator). */
const BOLTZ_RECIPIENT = process.env.BOLTZ_RECIPIENT || "";
/** On Railway/headless, Rumble's Cloudflare cannot be solved — use EXPECTED_ADDRESS only. */
const SKIP_RUMBLE = process.env.SKIP_RUMBLE === "true";

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
    let creatorAddress: string;

    if (SKIP_RUMBLE) {
      if (!EXPECTED_ADDRESS || !/^0x[a-fA-F0-9]{40}$/.test(EXPECTED_ADDRESS.trim())) {
        throw new Error(
          "SKIP_RUMBLE requires EXPECTED_ADDRESS=0x... (valid Polygon creator address)"
        );
      }
      logStep(
        3,
        `Extracting creator address — skipping Rumble UI (SKIP_RUMBLE), using EXPECTED_ADDRESS`
      );
      creatorAddress = EXPECTED_ADDRESS.trim();
      log(`  Creator address: ${creatorAddress}`);
      log(`  Creator: ${RUMBLE_USER} (demo label; address from env)`);
    } else {
      logStep(3, `Extracting creator address from Rumble (${RUMBLE_USER})...`);

      creatorAddress = await extractCreatorAddress(
        page,
        RUMBLE_USER,
        EXPECTED_ADDRESS,
        log
      );

      log(`  Creator: ${RUMBLE_USER}`);
      log(`  Address: ${creatorAddress}`);
    }

    const payoutAddresses = loadPayoutAddressesFromConfig();
    // Stable contract for tipsats-backend pipeline (prefer this list over re-reading config).
    console.log(`Payout addresses: ${payoutAddresses.join(",")}`);

    // ── Step 4: Boltz swap → Lightning invoice ──
    const boltzRecipient = BOLTZ_RECIPIENT || creatorAddress;
    const swapSats = TIP_AMOUNT_SATS > 0 ? TIP_AMOUNT_SATS : Math.round(TIP_AMOUNT_USD * 1500);
    logStep(4, `Creating Boltz swap: ${swapSats} sats → USDT...`);
    if (BOLTZ_RECIPIENT) {
      log(`  Boltz receive → agent address: ${BOLTZ_RECIPIENT}`);
      log(`  Creator address for later payout: ${creatorAddress}`);
    }

    const { swapId, bolt11, satsAmount, usdtAmount } = await createBoltzSwap(
      context,
      boltzRecipient,
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
    console.log(`│  To:       ${boltzRecipient} (Polygon)`);
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
