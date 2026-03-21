import { exec } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import type { PipelineStep, TxDetails } from "./types.js";
import {
  updateTipStatus,
  updateTipSteps,
  updateTipTxDetails,
  setTipError,
} from "./tip-store.js";
import { payInvoice, quotePayInvoice } from "./spark.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_DIR = path.resolve(__dirname, "../../../test-harness-twdk-spark-ln");

const HARNESS_STEP_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /Launching browser/, name: "Launching browser" },
  { pattern: /Extracting creator address/, name: "Browsing Rumble" },
  { pattern: /Creator address:/, name: "Creator found" },
  { pattern: /Creating Boltz swap/, name: "Creating atomic swap" },
  { pattern: /Swap created:/, name: "Swap created" },
  { pattern: /Invoice copied/, name: "Lightning invoice ready" },
];

const ALL_STEP_NAMES = [
  ...HARNESS_STEP_PATTERNS.map((s) => s.name),
  "Paying via Lightning",
  "Payment confirmed",
];

function parseSteps(output: string): PipelineStep[] {
  const steps: PipelineStep[] = [];

  for (const { pattern, name } of HARNESS_STEP_PATTERNS) {
    if (pattern.test(output)) {
      steps.push({ name, status: "done" });
    }
  }

  const doneCount = steps.length;
  const nextIdx = doneCount;
  if (nextIdx < ALL_STEP_NAMES.length) {
    steps.push({ name: ALL_STEP_NAMES[nextIdx], status: "running" });
  }
  for (let i = nextIdx + 1; i < ALL_STEP_NAMES.length; i++) {
    steps.push({ name: ALL_STEP_NAMES[i], status: "pending" });
  }

  return steps;
}

function parseBolt11(output: string): string | null {
  const match = output.match(/(lnbc[a-z0-9]{50,})/i);
  return match ? match[1] : null;
}

function parseTxDetails(output: string, paymentId: string): TxDetails | null {
  const swapIdMatch = output.match(/Swap ID:\s+(\S+)/);
  const creatorMatch = output.match(/Creator:\s+(\S+)/);
  const addressMatch = output.match(/Address:\s+(0x[a-fA-F0-9]{40})/);
  const amountMatch = output.match(/Amount:\s+~?(\d[\d\s]*)\s*sats\s+\(~([\d.]+)\s+USDT\)/);

  if (!swapIdMatch) return null;

  return {
    swapId: swapIdMatch[1],
    paymentId,
    creator: creatorMatch?.[1] ?? "unknown",
    creatorAddress: addressMatch?.[1] ?? "",
    amountSats: amountMatch?.[1]?.replace(/\s/g, "") ?? "",
    amountUsdt: amountMatch?.[2] ?? "",
    boltzUrl: `https://beta.boltz.exchange/swap/${swapIdMatch[1]}`,
  };
}

const running = new Set<string>();

export function runPipeline(tipId: string, tipAmountSats: number): void {
  updateTipStatus(tipId, "agent_running");
  running.add(tipId);

  const isHeadless = process.env.HEADLESS === "true";

  const { WDK_SEED: _omit, ...parentEnv } = process.env;
  const env = {
    ...parentEnv,
    DRY_RUN: "false",
    KEEP_BROWSER_OPEN: "true",
    HEADLESS: isHeadless ? "true" : "false",
    RUMBLE_USER: "crypto_vib",
    TIP_AMOUNT_SATS: String(tipAmountSats),
    EXPECTED_ADDRESS: "0xf6ae15c6f613638be32f934d986b45522e3f546f",
    WDK_SEED: "",
  };

  let output = "";
  let paymentTriggered = false;

  const child = exec("npx tsx run.ts", {
    cwd: HARNESS_DIR,
    env,
    timeout: 300_000,
  });

  async function triggerPayment(bolt11: string) {
    if (paymentTriggered) return;
    paymentTriggered = true;

    const swapIdMatch = output.match(/Swap ID:\s+(\S+)/);
    const creatorMatch = output.match(/Creator:\s+(\S+)/);
    const addressMatch = output.match(/Address:\s+(0x[a-fA-F0-9]{40})/);

    console.log(`[TipSats] ─── Invoice detected, paying immediately ───`);
    console.log(`[TipSats]   Swap ID:  ${swapIdMatch?.[1] ?? "NOT FOUND"}`);
    console.log(`[TipSats]   Creator:  ${creatorMatch?.[1] ?? "NOT FOUND"}`);
    console.log(`[TipSats]   Address:  ${addressMatch?.[1] ?? "NOT FOUND"}`);
    console.log(`[TipSats]   Invoice:  ${bolt11.slice(0, 60)}... (${bolt11.length} chars)`);

    updateTipSteps(tipId, [
      ...HARNESS_STEP_PATTERNS.map((s) => ({ name: s.name, status: "done" as const })),
      { name: "Paying via Lightning", status: "running" as const },
      { name: "Payment confirmed", status: "pending" as const },
    ]);

    try {
      try {
        const fee = await quotePayInvoice(bolt11);
        console.log(`[TipSats] Fee estimate: ${fee} sats`);
      } catch (e: any) {
        console.log(`[TipSats] Fee estimate unavailable: ${e.message}`);
      }

      console.log(`[TipSats] Calling payInvoice...`);
      const result = await payInvoice(bolt11);
      console.log(`[TipSats] Payment result: ID=${result.id}, Fee=${result.fee} sats`);

      updateTipSteps(tipId, [
        ...HARNESS_STEP_PATTERNS.map((s) => ({ name: s.name, status: "done" as const })),
        { name: "Paying via Lightning", status: "done" as const },
        { name: "Payment confirmed", status: "done" as const },
      ]);

      const txDetails = parseTxDetails(output, result.id);
      console.log(`[TipSats] txDetails: ${JSON.stringify(txDetails)}`);
      if (txDetails) {
        updateTipTxDetails(tipId, txDetails);
      }
      updateTipStatus(tipId, "completed");
    } catch (err: any) {
      console.error(`[TipSats] Payment failed: ${err.message}`);
      updateTipSteps(tipId, [
        ...HARNESS_STEP_PATTERNS.map((s) => ({ name: s.name, status: "done" as const })),
        { name: "Paying via Lightning", status: "error" as const, detail: err.message },
        { name: "Payment confirmed", status: "pending" as const },
      ]);
      setTipError(tipId, `Lightning payment failed: ${err.message}`);
    } finally {
      running.delete(tipId);
      try { child.kill(); } catch {}
    }
  }

  const onData = (chunk: string) => {
    output += chunk;
    console.log(chunk.trimEnd());
    const steps = parseSteps(output);
    updateTipSteps(tipId, steps);

    if (!paymentTriggered) {
      const bolt11 = parseBolt11(output);
      if (bolt11 && output.includes("Invoice copied")) {
        triggerPayment(bolt11);
      }
    }
  };

  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  child.on("close", (code) => {
    console.log(`[TipSats] Harness exited with code ${code}`);
    if (!paymentTriggered) {
      running.delete(tipId);
      if (code !== 0) {
        const errorLine = output.split("\n").find((l) => l.includes("Error:"));
        setTipError(tipId, errorLine ?? `Pipeline exited with code ${code}`);
      } else {
        setTipError(tipId, "Harness exited without producing an invoice");
      }
    }
  });

  child.on("error", (err) => {
    if (!paymentTriggered) {
      running.delete(tipId);
      setTipError(tipId, err.message);
    }
  });
}

export function isRunning(tipId: string): boolean {
  return running.has(tipId);
}
