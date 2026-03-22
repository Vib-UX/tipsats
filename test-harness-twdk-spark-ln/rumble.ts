import type { Page } from "playwright";
import { navigateAndWait, waitForCloudflare } from "./browser.js";

type Log = (msg: string) => void;

async function snapshot(page: Page, label: string, log: Log): Promise<string> {
  const text = await page.evaluate(() => document.body?.innerText || "");
  log(`  [snapshot:${label}] ${text.slice(0, 200).replace(/\n/g, " ")}...`);
  return text;
}

/** Channel pages often use different chrome than /user/ — try roles + scroll. */
async function tryClickTipOrRantButton(page: Page, log: Log): Promise<boolean> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);

  const candidates: { name: string; run: () => Promise<boolean> }[] = [
    {
      name: "getByRole button /tip|rants|rant/i",
      run: async () => {
        const loc = page.getByRole("button", { name: /tip|rants|rant/i }).first();
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        if (await loc.isVisible().catch(() => false)) {
          await loc.click({ timeout: 5000 });
          return true;
        }
        return false;
      },
    },
    {
      name: "getByRole link /tip/i",
      run: async () => {
        const loc = page.getByRole("link", { name: /tip/i }).first();
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        if (await loc.isVisible().catch(() => false)) {
          await loc.click({ timeout: 5000 });
          return true;
        }
        return false;
      },
    },
    {
      name: "a[href*='tip']",
      run: async () => {
        const loc = page.locator('a[href*="tip"]').first();
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        if (await loc.isVisible().catch(() => false)) {
          await loc.click({ timeout: 5000 });
          return true;
        }
        return false;
      },
    },
    {
      name: "text Rant & Tip",
      run: async () => {
        const loc = page.getByText(/rant\s*&\s*tip/i).first();
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        if (await loc.isVisible().catch(() => false)) {
          await loc.click({ timeout: 5000 });
          return true;
        }
        return false;
      },
    },
  ];

  for (const { name, run } of candidates) {
    try {
      if (await run()) {
        log(`  Clicked Tip entry via: ${name}`);
        await page.waitForTimeout(1500);
        return true;
      }
    } catch {
      /* next */
    }
  }
  return false;
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

export type ChannelTipResult = { channelUrl: string; tipAddress: string };

/**
 * On a Rumble **channel** (`/c/...`) or **user** (`/user/...`) page: open Tip flow and read Polygon USDT address.
 */
export async function extractPolygonTipAddressFromCurrentPage(
  page: Page,
  expectedAddress: string,
  log: Log
): Promise<string> {
  await snapshot(page, "channel-or-profile", log);

  // Click Tip / Rant entry (channel `/c/` pages differ from `/user/` layouts)
  log("Looking for Tip / Rant button on channel or profile...");
  let tipFound = await tryClickTipOrRantButton(page, log);
  if (!tipFound) {
    tipFound = await findAndClick(
      page,
      [
        'button:has-text("Tip")',
        '[class*="tip-button"]',
        '[class*="tip"] button',
        'button[title*="Tip"]',
        '[data-action="tip"]',
        'button:has-text("tip")',
        ".rumbles-vote-pill button",
        'button:has-text("Rant")',
        '[class*="rant"] button',
        'button:has-text("Support")',
        'a:has-text("Tip")',
        '[class*="header"] button:has-text("Tip")',
      ],
      "Tip button",
      15_000
    );
  }

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
  await navigateAndWait(page, `https://rumble.com/user/${rumbleUser}`, log);
  return extractPolygonTipAddressFromCurrentPage(page, expectedAddress, log);
}

async function tryOpenChannelsTab(page: Page, log: Log): Promise<void> {
  const tabSelectors = [
    'a:has-text("Channels")',
    'button:has-text("Channels")',
    '[role="tab"]:has-text("Channels")',
    "text=Channels",
  ];
  for (const sel of tabSelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 })) {
        await el.click();
        log("  Opened Channels tab");
        await page.waitForTimeout(2000);
        return;
      }
    } catch {
      /* try next */
    }
  }
  log("  (No Channels tab clicked — using mixed results)");
}

async function closeTipUi(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}

/** Default Playwright demo: Bitcoin Ben first, then Simply Bitcoin (matches Mission Control examples). */
export const DEFAULT_DEMO_CHANNEL_SLUGS = ["BITCOINBEN", "SimplyBitcoin"] as const;

/**
 * Playwright demo: open Rumble search (context), then visit **fixed channels in order** — tip on each,
 * go back to search between visits.
 *
 * Default order: **Bitcoin Ben** (`/c/BITCOINBEN`) → **Simply Bitcoin** (`/c/SimplyBitcoin`).
 */
export async function extractTwoChannelsFromSearchDemo(
  page: Page,
  searchQuery: string,
  expectedAddress: string,
  log: Log,
  channelSlugs: readonly string[] = DEFAULT_DEMO_CHANNEL_SLUGS
): Promise<{ channels: ChannelTipResult[]; primaryAddress: string }> {
  if (channelSlugs.length < 2) {
    throw new Error("extractTwoChannelsFromSearchDemo: need at least 2 channel slugs");
  }

  const searchUrl = `https://rumble.com/search/all?q=${encodeURIComponent(searchQuery)}`;
  log(`Search demo: ${searchUrl}`);
  await navigateAndWait(page, searchUrl, log);
  await snapshot(page, "search-results", log);

  await tryOpenChannelsTab(page, log);
  await page.waitForTimeout(1500);

  const urls = channelSlugs.slice(0, 2).map((slug) => {
    const s = slug.trim().replace(/^\/+/, "");
    return `https://rumble.com/c/${s}`;
  });
  log(
    `  Fixed channel order: ${urls.map((u) => u.replace("https://rumble.com/c/", "")).join(" → ")}`
  );

  const channels: ChannelTipResult[] = [];

  for (let i = 0; i < 2; i++) {
    const targetUrl = urls[i];
    log(`\n  ── Channel ${i + 1}: ${targetUrl} ──`);
    await navigateAndWait(page, targetUrl, log);

    const channelUrl = page.url().split("?")[0];
    log(`  Channel URL: ${channelUrl}`);

    const tipAddress = await extractPolygonTipAddressFromCurrentPage(
      page,
      expectedAddress,
      log
    );
    log(`  Tip address (Polygon USDT): ${tipAddress}`);
    channels.push({ channelUrl, tipAddress });

    await closeTipUi(page);

    if (i === 0) {
      log("  Going back to search results...");
      await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
      await waitForCloudflare(page, log);
      await page.waitForTimeout(1500);
      const u = page.url();
      if (!u.includes("/search")) {
        log(`  goBack landed on ${u} — reopening search`);
        await navigateAndWait(page, searchUrl, log);
      }
    }
  }

  return { channels, primaryAddress: channels[0].tipAddress };
}
