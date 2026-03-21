import type { Page } from "playwright";
import { navigateAndWait } from "./browser.js";

type Log = (msg: string) => void;

async function snapshot(page: Page, label: string, log: Log): Promise<string> {
  const text = await page.evaluate(() => document.body?.innerText || "");
  log(`  [snapshot:${label}] ${text.slice(0, 200).replace(/\n/g, " ")}...`);
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

/**
 * Navigate the Rumble tip modal to extract the creator's USDT Polygon address.
 *
 * Steps: profile page -> Tip button -> "another crypto wallet" -> USDT -> Polygon -> extract 0x address
 */
export async function extractCreatorAddress(
  page: Page,
  rumbleUser: string,
  expectedAddress: string,
  log: Log
): Promise<string> {
  // Navigate to creator page (handles Cloudflare)
  await navigateAndWait(page, `https://rumble.com/user/${rumbleUser}`, log);
  await snapshot(page, "creator-page", log);

  // Click Tip button on profile page
  log("Looking for Tip button on profile page...");
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
    await page.screenshot({ path: "./debug-no-tip-button.png", fullPage: true });
    throw new Error(
      "Tip button not found. Make sure you're logged into Rumble in this browser profile."
    );
  }

  log("Clicked Tip button -- waiting for modal...");
  await page.waitForTimeout(2000);
  await snapshot(page, "tip-modal", log);

  // Click "Tip with another crypto wallet"
  log('Looking for "Tip with another crypto wallet" option...');
  const cryptoFound = await findAndClick(
    page,
    [
      "text=another crypto wallet",
      "text=crypto wallet",
      "text=other wallet",
      "text=another wallet",
      'button:has-text("crypto")',
      'a:has-text("crypto wallet")',
      '[class*="crypto"] button',
      '[class*="wallet"] button',
      "text=external wallet",
    ],
    '"Tip with another crypto wallet"',
    10_000
  );

  if (!cryptoFound) {
    await page.screenshot({ path: "./debug-no-crypto-option.png", fullPage: true });
    throw new Error("Crypto wallet option not found in tip modal");
  }

  log("Clicked crypto wallet option -- waiting for chain/token selector...");
  await page.waitForTimeout(2000);

  // Select USDT
  log("Selecting USDT...");
  await findAndClick(
    page,
    [
      "text=USDT",
      "text=Tether",
      '[class*="usdt"]',
      'img[alt*="USDT"]',
      'button:has-text("USDT")',
      '[data-token="usdt"]',
    ],
    "USDT",
    10_000
  );
  await page.waitForTimeout(1500);

  // Select Polygon
  log("Selecting Polygon network...");
  await findAndClick(
    page,
    [
      "text=Polygon",
      "text=MATIC",
      '[class*="polygon"]',
      'img[alt*="Polygon"]',
      'button:has-text("Polygon")',
      '[data-chain="polygon"]',
    ],
    "Polygon network",
    10_000
  );
  await page.waitForTimeout(2000);

  // Extract address
  log("Extracting creator's Polygon address...");
  const creatorAddress = await extractAddress(page);

  if (!creatorAddress) {
    await page.screenshot({ path: "./debug-no-address.png", fullPage: true });
    throw new Error("Creator Polygon address not found in tip modal");
  }

  log(`Creator address: ${creatorAddress}`);

  if (
    expectedAddress &&
    creatorAddress.toLowerCase() !== expectedAddress.toLowerCase()
  ) {
    log(`WARNING: Extracted address does not match EXPECTED_ADDRESS!`);
    log(`  Expected: ${expectedAddress}`);
    log(`  Got:      ${creatorAddress}`);
  }

  return creatorAddress;
}
