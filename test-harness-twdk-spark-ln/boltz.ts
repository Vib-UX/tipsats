import type { BrowserContext, Page } from "playwright";

type Log = (msg: string) => void;

export interface BoltzSwapResult {
  swapId: string;
  bolt11: string;
  satsAmount: string;
  usdtAmount: string;
}

async function clickByText(
  page: Page,
  candidates: string[],
  description: string,
  timeoutMs = 10_000
): Promise<void> {
  for (const text of candidates) {
    try {
      const loc = page.locator(text);
      await loc.click({ timeout: timeoutMs / candidates.length });
      return;
    } catch {
      // try next
    }
  }
  throw new Error(`Could not find ${description}`);
}

/**
 * Automate the Boltz Exchange UI to create a Lightning -> USDT (Polygon) swap.
 *
 * Opens a new browser tab, configures the swap, creates it, and extracts
 * the full Lightning invoice by clicking the "LIGHTNING INVOICE" button
 * (which copies to clipboard).
 */
export async function createBoltzSwap(
  context: BrowserContext,
  recipientAddress: string,
  satsToSend: number,
  log: Log
): Promise<BoltzSwapResult> {
  const page = await context.newPage();

  try {
    // Navigate to Boltz with Lightning send pre-selected
    log("Opening Boltz Exchange...");
    await page.goto(
      "https://beta.boltz.exchange/?sendAsset=LN&receiveAsset=USDT0",
      { waitUntil: "domcontentloaded", timeout: 30_000 }
    );
    await page.waitForTimeout(4000);

    // The URL pre-selects USDT on Arbitrum. We need Polygon PoS.
    // Step 1: Open the receive-asset dropdown.
    log("Selecting USDT on Polygon PoS...");

    const currentNetwork = await page
      .locator('input[placeholder*="address to receive"]')
      .getAttribute("placeholder")
      .catch(() => "");
    log(`  Current receive config: ${currentNetwork}`);

    // The receive-side asset selector is the 3rd button on the page (0-indexed: 2)
    // after the nav hamburger (0) and send-side selector (1).
    await page.locator("button").nth(2).click({ timeout: 5000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "./debug-boltz-dropdown.png" });

    // Step 2: Click "USDT Select network" to expand network sub-menu.
    // Use waitFor with a longer timeout since the dropdown may animate.
    const usdtNetworkBtn = page.locator(
      'button:has-text("USDT Select network"), button:has-text("Select network")'
    );
    try {
      await usdtNetworkBtn.first().waitFor({ state: "visible", timeout: 5000 });
      await usdtNetworkBtn.first().click();
      await page.waitForTimeout(1500);
    } catch {
      log("  'USDT Select network' not found -- trying direct Polygon search...");
    }

    await page.screenshot({ path: "./debug-boltz-networks.png" });

    // Step 3: Click "Polygon PoS" -- it may require scrolling within the dropdown
    const polygonBtn = page.locator('button:has-text("Polygon PoS")');
    try {
      await polygonBtn.waitFor({ state: "visible", timeout: 5000 });
    } catch {
      // Try scrolling the dropdown container to reveal Polygon PoS
      log("  Polygon PoS not visible, scrolling dropdown...");
      await page.evaluate(() => {
        const scrollable = document.querySelector('[class*="dropdown"], [class*="scroll"], [class*="list"], [role="listbox"]');
        if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
      });
      await page.waitForTimeout(1000);
    }
    await polygonBtn.click({ timeout: 8000 });
    await page.waitForTimeout(2000);
    log("  Selected Polygon PoS network");

    // Verify the address placeholder now mentions Polygon
    const newPlaceholder = await page
      .locator('input[placeholder*="address to receive"]')
      .getAttribute("placeholder")
      .catch(() => "");
    log(`  Address field: ${newPlaceholder}`);

    // Enter the sats amount in the send (Lightning) field directly
    log(`Setting send amount: ${satsToSend} sats...`);
    const sendInput = page.locator('input[placeholder="0"]').first();
    await sendInput.click();
    await sendInput.fill(String(satsToSend));
    await page.waitForTimeout(2000);

    // Read the calculated USDT amount from the receive field
    const receiveInput = page.locator('input[placeholder="0"]').nth(1);
    const usdtAmount = await receiveInput.inputValue();
    log(`  Creator will receive: ~${usdtAmount} USDT`);

    // Paste the recipient address
    log(`Pasting recipient address: ${recipientAddress}...`);
    const addressInput = page.locator(
      'input[placeholder*="address to receive funds"]'
    );
    await addressInput.fill(recipientAddress);
    await page.waitForTimeout(2000);

    // Click "Create Atomic Swap"
    log('Clicking "Create Atomic Swap"...');
    const swapBtn = page.locator('button:has-text("Create Atomic Swap")');
    await swapBtn.waitFor({ state: "visible", timeout: 10_000 });

    // Wait for the button to become enabled
    await page.waitForFunction(
      () => {
        const buttons = document.querySelectorAll("button");
        for (const b of buttons) {
          if (b.textContent?.includes("Create Atomic Swap")) {
            return !b.disabled;
          }
        }
        return false;
      },
      { timeout: 10_000 }
    );

    await swapBtn.click();
    log("  Swap creation in progress...");

    // Wait for redirect to swap page
    await page.waitForURL(/beta\.boltz\.exchange\/swap\//, { timeout: 20_000 });
    const swapUrl = page.url();
    const swapId = swapUrl.split("/swap/")[1]?.split("?")[0] || "unknown";
    log(`  Swap created: ${swapId}`);
    log(`  URL: ${swapUrl}`);

    await page.waitForTimeout(4000);

    // Read actual sats amount from the "Pay this invoice about X sats" heading
    let finalSats = String(satsToSend);
    try {
      const payText = await page
        .locator("text=Pay this invoice about")
        .textContent({ timeout: 5000 });
      if (payText) {
        const satsMatch = payText.match(/([\d\s]+)\s*sats/);
        if (satsMatch) {
          finalSats = satsMatch[1].replace(/\s/g, "");
        }
      }
    } catch {
      // keep the input amount
    }
    log(`  Invoice amount: ~${finalSats} sats`);

    // Click "LIGHTNING INVOICE" to copy the full bolt11 to clipboard
    log('Clicking "LIGHTNING INVOICE" to copy invoice...');

    // Scroll down to make the button visible
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(1500);

    // The button may be a <button>, <div>, or <span> with this text
    await clickByText(
      page,
      [
        "text=LIGHTNING INVOICE",
        'button:has-text("LIGHTNING INVOICE")',
        "[class*='invoice'] >> text=LIGHTNING",
        "text=Lightning Invoice",
      ],
      "LIGHTNING INVOICE button",
      10_000
    );
    await page.waitForTimeout(2000);

    // Read the invoice from clipboard
    const bolt11 = await page.evaluate(() => navigator.clipboard.readText());

    if (!bolt11 || !bolt11.startsWith("lnbc")) {
      log(`  Clipboard returned: "${(bolt11 || "").slice(0, 60)}..."`);
      // Fallback: try to extract from the page DOM
      log("  Trying DOM fallback...");
      const pageText = await page.evaluate(() => document.body?.innerText || "");
      const lnMatch = pageText.match(/(lnbc[a-z0-9]+)/i);
      if (lnMatch) {
        log("  Found invoice in page text (may be truncated)");
        return { swapId, bolt11: lnMatch[1], satsAmount: finalSats, usdtAmount };
      }
      throw new Error(
        "Could not extract Lightning invoice from clipboard or page"
      );
    }

    log(`  Invoice copied successfully (${bolt11.length} chars)`);
    return { swapId, bolt11, satsAmount: finalSats, usdtAmount };
  } finally {
    log("  Boltz tab left open for inspection");
  }
}
