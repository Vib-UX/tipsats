import "dotenv/config";
import { launchBrowser, navigateAndWait } from "./browser.js";
import { initWallet, formatUsdt, parseUsdt } from "./wallet.js";
import type { Page } from "playwright";

const DRY_RUN = process.env.DRY_RUN !== "false";
const RUMBLE_USER = process.env.RUMBLE_USER || "crypto_vib";
const TIP_AMOUNT = parseFloat(process.env.TIP_AMOUNT_USD || "1.00");
const WDK_SEED = process.env.WDK_SEED || "";
const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";

function log(msg: string) {
  console.log(`[TipSats] ${msg}`);
}

function logStep(step: number, msg: string) {
  console.log(`\n[TipSats] ══════ Step ${step} ══════`);
  console.log(`[TipSats] ${msg}`);
}

async function snapshot(page: Page, label: string): Promise<string> {
  const text = await page.evaluate(() => document.body?.innerText || "");
  const truncated = text.slice(0, 2000);
  log(`  [snapshot:${label}] ${truncated.slice(0, 200).replace(/\n/g, " ")}...`);
  return text;
}

async function findAndClick(
  page: Page,
  selectors: string[],
  description: string,
  timeoutMs = 10_000
): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const el = await page.waitForSelector(selector, {
        timeout: timeoutMs / selectors.length,
        state: "visible",
      });
      if (el) {
        log(`  Found ${description}: ${selector}`);
        await el.click();
        await page.waitForTimeout(1500);
        return true;
      }
    } catch {
      // try next selector
    }
  }
  return false;
}

async function extractAddress(page: Page): Promise<string | null> {
  const text = await page.evaluate(() => document.body?.innerText || "");
  const evmMatch = text.match(/0x[a-fA-F0-9]{40}/);
  if (evmMatch) return evmMatch[0];

  // Also try input fields / code elements that might hold an address
  const inputAddr = await page
    .evaluate(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>(
        'input[readonly], input[type="text"], code, [class*="address"]'
      );
      for (const el of inputs) {
        const val = el.value || el.textContent || "";
        const m = val.match(/0x[a-fA-F0-9]{40}/);
        if (m) return m[0];
      }
      return null;
    })
    .catch(() => null);

  return inputAddr;
}

// ─── Main pipeline ───

async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║     TipSats Local Test Harness              ║");
  console.log("║     Rumble → USDT Polygon Tip Flow          ║");
  console.log(`║     Mode: ${DRY_RUN ? "DRY RUN (no real tx)" : "💸 WET RUN (real USDT!)"}         ║`);
  console.log("╚══════════════════════════════════════════════╝\n");

  // ── Step 1: Init WDK wallet ──
  logStep(1, "Initializing WDK wallet (Polygon)...");

  if (!WDK_SEED) {
    log("  ⚠  No WDK_SEED set. Wallet features will be skipped.");
    log("  Set WDK_SEED in .env or pass as env var to enable wallet.");
  }

  let wallet: Awaited<ReturnType<typeof initWallet>> | null = null;
  if (WDK_SEED) {
    try {
      wallet = await initWallet(WDK_SEED, POLYGON_RPC);
      log(`  Address:      ${wallet.info.address}`);
      log(`  USDT Balance: ${formatUsdt(wallet.info.usdtBalance)} USDT`);
      log(`  MATIC Balance: ${wallet.info.maticBalance} wei`);
    } catch (err: any) {
      log(`  ⚠  Wallet init failed: ${err.message}`);
      log("  Continuing without wallet (browser-only mode)...");
    }
  }

  // ── Step 2: Launch browser ──
  logStep(2, "Launching browser...");

  const { context, page } = await launchBrowser();
  log("  Browser launched (persistent Chrome profile)");

  try {
    // ── Step 3: Navigate to creator page ──
    logStep(3, `Navigating to Rumble user: ${RUMBLE_USER}...`);
    await navigateAndWait(
      page,
      `https://rumble.com/user/${RUMBLE_USER}`,
      log
    );
    await snapshot(page, "creator-page");

    // Use the Tip button directly on the profile page.
    // Don't navigate to a video -- recommended/featured videos may belong to
    // other creators, and we'd extract the wrong address.
    logStep(4, "Looking for Tip button on profile page...");

    const tipFound = await findAndClick(
      page,
      [
        'button:has-text("Tip")',
        '[class*="tip-button"]',
        '[class*="tip"] button',
        'button[title*="Tip"]',
        '[data-action="tip"]',
        'button:has-text("tip")',
        '.rumbles-vote-pill button',
        'button:has-text("Rant")',
        '[class*="rant"] button',
      ],
      "Tip button",
      15_000
    );

    if (!tipFound) {
      log("  ⚠  Could not find Tip button. Taking a page snapshot for debugging...");
      await snapshot(page, "no-tip-button");
      const screenshotPath = "./debug-no-tip-button.png";
      await page.screenshot({ path: screenshotPath, fullPage: true });
      log(`  Screenshot saved to ${screenshotPath}`);
      log("  Tip: Make sure you're logged into Rumble in this browser profile.");
      throw new Error("Tip button not found");
    }

    log("  Clicked Tip button -- waiting for modal...");
    await page.waitForTimeout(2000);
    await snapshot(page, "tip-modal");

    // ── Step 5: Click "Tip with another crypto wallet" ──
    logStep(5, 'Looking for "Tip with another crypto wallet" option...');

    const cryptoWalletFound = await findAndClick(
      page,
      [
        'text=another crypto wallet',
        'text=crypto wallet',
        'text=other wallet',
        'text=another wallet',
        'button:has-text("crypto")',
        'a:has-text("crypto wallet")',
        '[class*="crypto"] button',
        '[class*="wallet"] button',
        'text=external wallet',
      ],
      '"Tip with another crypto wallet"',
      10_000
    );

    if (!cryptoWalletFound) {
      log("  ⚠  Could not find crypto wallet option. Snapshot for debugging:");
      await snapshot(page, "no-crypto-option");
      await page.screenshot({ path: "./debug-no-crypto-option.png", fullPage: true });
      throw new Error("Crypto wallet option not found in tip modal");
    }

    log("  Clicked crypto wallet option -- waiting for chain/token selector...");
    await page.waitForTimeout(2000);
    await snapshot(page, "crypto-selector");

    // ── Step 6: Select USDT on Polygon ──
    logStep(6, "Selecting USDT on Polygon...");

    // Try to select USDT
    const usdtFound = await findAndClick(
      page,
      [
        'text=USDT',
        'text=Tether',
        '[class*="usdt"]',
        'img[alt*="USDT"]',
        'button:has-text("USDT")',
        '[data-token="usdt"]',
        '[data-currency="usdt"]',
      ],
      "USDT",
      10_000
    );

    if (!usdtFound) {
      log("  ⚠  Could not find USDT option. Trying to proceed anyway...");
      await snapshot(page, "no-usdt");
    }

    await page.waitForTimeout(1500);

    // Try to select Polygon network
    const polygonFound = await findAndClick(
      page,
      [
        'text=Polygon',
        'text=MATIC',
        'text=polygon',
        '[class*="polygon"]',
        'img[alt*="Polygon"]',
        'button:has-text("Polygon")',
        '[data-chain="polygon"]',
        '[data-network="polygon"]',
      ],
      "Polygon network",
      10_000
    );

    if (!polygonFound) {
      log("  ⚠  Could not find Polygon option. Trying to proceed anyway...");
      await snapshot(page, "no-polygon");
    }

    await page.waitForTimeout(2000);
    await snapshot(page, "address-display");

    // ── Step 7: Extract creator's address ──
    logStep(7, "Extracting creator's Polygon address...");

    const creatorAddress = await extractAddress(page);

    if (!creatorAddress) {
      log("  ⚠  Could not extract a 0x address from the modal.");
      await snapshot(page, "no-address-found");
      await page.screenshot({ path: "./debug-no-address.png", fullPage: true });
      throw new Error("Creator Polygon address not found");
    }

    log(`  Creator address: ${creatorAddress}`);

    // Sanity check: warn if address doesn't look right
    const KNOWN_ADDRESS = process.env.EXPECTED_ADDRESS || "";
    if (KNOWN_ADDRESS && creatorAddress.toLowerCase() !== KNOWN_ADDRESS.toLowerCase()) {
      log(`  ⚠  WARNING: Extracted address does not match EXPECTED_ADDRESS!`);
      log(`     Expected: ${KNOWN_ADDRESS}`);
      log(`     Got:      ${creatorAddress}`);
      log(`  Proceeding with extracted address...`);
    }

    // ── Step 8: Tip decision ──
    const tipAmountRaw = parseUsdt(TIP_AMOUNT);
    logStep(8, "Tip decision");
    log(`  Creator:   ${RUMBLE_USER}`);
    log(`  Recipient: ${creatorAddress}`);
    log(`  Amount:    ${TIP_AMOUNT} USDT (${tipAmountRaw} raw, Polygon)`);

    if (DRY_RUN) {
      log(`  Mode:      DRY RUN`);
      log(`  >> Would send ${TIP_AMOUNT} USDT to ${creatorAddress} on Polygon`);

      if (wallet) {
        try {
          const quote = await wallet.quoteTransfer(creatorAddress, tipAmountRaw);
          log(`  >> Estimated gas fee: ${quote.fee} wei`);
        } catch (err: any) {
          log(`  >> Fee estimate failed: ${err.message}`);
        }
      }
    } else {
      if (!wallet) {
        throw new Error("Cannot send -- no wallet initialized (set WDK_SEED)");
      }

      log(`  Mode:      WET RUN -- sending real USDT!`);

      if (wallet.info.usdtBalance < tipAmountRaw) {
        throw new Error(
          `Insufficient USDT balance: ${formatUsdt(wallet.info.usdtBalance)} < ${TIP_AMOUNT}`
        );
      }

      const quote = await wallet.quoteTransfer(creatorAddress, tipAmountRaw);
      log(`  Gas fee estimate: ${quote.fee} wei`);
      log(`  Sending ${TIP_AMOUNT} USDT to ${creatorAddress}...`);

      const result = await wallet.transfer(creatorAddress, tipAmountRaw);
      log(`  ✓ Transaction sent!`);
      log(`  TX Hash: ${result.hash}`);
      log(`  Fee:     ${result.fee} wei`);
    }

    // ── Summary ──
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║     Test Complete                            ║");
    console.log("╚══════════════════════════════════════════════╝");
    log(`Creator:   ${RUMBLE_USER}`);
    log(`Address:   ${creatorAddress}`);
    log(`Amount:    ${TIP_AMOUNT} USDT (Polygon)`);
    log(`Mode:      ${DRY_RUN ? "DRY RUN" : "SENT"}`);
    if (wallet) {
      log(`Agent wallet: ${wallet.info.address}`);
    }
  } catch (err: any) {
    log(`\n  ✗ Error: ${err.message}`);
    log("  Check debug screenshots (debug-*.png) for UI state.");
    process.exitCode = 1;
  } finally {
    log("\nClosing browser in 5s (inspect if needed)...");
    await new Promise((r) => setTimeout(r, 5000));
    await context.close();
  }
}

main();
