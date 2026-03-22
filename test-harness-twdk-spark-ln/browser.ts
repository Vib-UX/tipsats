import { chromium, type BrowserContext, type Page } from "playwright";
import path from "path";

const PROFILE_DIR = path.resolve(import.meta.dirname, ".chrome-profile");
const CLOUDFLARE_TITLE = "Just a moment...";
const CLOUDFLARE_POLL_MS = 2000;
const CLOUDFLARE_TIMEOUT_MS = Number(process.env.CLOUDFLARE_TIMEOUT_MS) || 120_000;

export async function launchBrowser(): Promise<{
  context: BrowserContext;
  page: Page;
}> {
  const isHeadless = process.env.HEADLESS === "true";
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: isHeadless,
    viewport: { width: 1280, height: 800 },
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  const page = context.pages()[0] || (await context.newPage());
  return { context, page };
}

export async function waitForCloudflare(
  page: Page,
  log: (msg: string) => void
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < CLOUDFLARE_TIMEOUT_MS) {
    let title = "";
    try {
      title = await page.title();
    } catch {
      // Context destroyed mid-navigation (Cloudflare redirect) -- retry
      await page.waitForTimeout(CLOUDFLARE_POLL_MS);
      continue;
    }

    if (
      !title.toLowerCase().includes("just a moment") &&
      !title.toLowerCase().includes("security") &&
      title.length > 0
    ) {
      return;
    }

    const headless = process.env.HEADLESS === "true";
    const hint = headless
      ? `datacenter/headless browsers usually cannot pass Rumble's Cloudflare — use SKIP_RUMBLE=true and EXPECTED_ADDRESS on the server`
      : `solve it in the browser if prompted`;
    log(
      `  Cloudflare check in progress... (${Math.round((Date.now() - start) / 1000)}s) — ${hint}`
    );
    await page.waitForTimeout(CLOUDFLARE_POLL_MS);
  }

  throw new Error(
    `Cloudflare challenge not solved within ${CLOUDFLARE_TIMEOUT_MS / 1000}s`
  );
}

export async function navigateAndWait(
  page: Page,
  url: string,
  log: (msg: string) => void
): Promise<void> {
  log(`  Navigating to ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitForCloudflare(page, log);
  const title = await page.title();
  log(`  Page loaded: ${title}`);
}
