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
import { getAgentAddress, batchTransferUsdt, getUsdtBalance, quoteBatchTransfer } from "./evm4337.js";
import {
  loadPayoutAddresses,
  resolvePayoutAddresses,
  splitEvenUsdt,
} from "./payout-config.js";

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
  "USDT received by agent",
  "Distributing to creators",
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

function parseTxDetails(output: string, paymentId: string, agentAddr: string): TxDetails | null {
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
    agentAddress: agentAddr,
    amountSats: amountMatch?.[1]?.replace(/\s/g, "") ?? "",
    amountUsdt: amountMatch?.[2] ?? "",
    boltzUrl: `https://beta.boltz.exchange/swap/${swapIdMatch[1]}`,
  };
}

function makeSteps(doneUpTo: number, extraSteps?: PipelineStep[]): PipelineStep[] {
  const steps: PipelineStep[] = ALL_STEP_NAMES.map((name, i) => ({
    name,
    status: i < doneUpTo ? "done" as const : i === doneUpTo ? "running" as const : "pending" as const,
  }));
  if (extraSteps) return [...steps.slice(0, doneUpTo), ...extraSteps, ...steps.slice(doneUpTo + extraSteps.length)];
  return steps;
}

const running = new Set<string>();

export async function runPipeline(tipId: string, tipAmountSats: number): Promise<void> {
  updateTipStatus(tipId, "agent_running");
  running.add(tipId);

  let payoutConfigAddresses: string[];
  try {
    payoutConfigAddresses = loadPayoutAddresses();
  } catch (err: any) {
    setTipError(tipId, `Payout config failed: ${err.message}`);
    running.delete(tipId);
    return;
  }
  const expectedAddress = payoutConfigAddresses[0];

  let agentAddr: string;
  try {
    agentAddr = await getAgentAddress();
    console.log(`[TipSats] Agent 4337 address: ${agentAddr}`);
  } catch (err: any) {
    setTipError(tipId, `ERC-4337 init failed: ${err.message}`);
    running.delete(tipId);
    return;
  }

  const isHeadless = process.env.HEADLESS === "true";
  const skipRumble =
    process.env.SKIP_RUMBLE !== undefined
      ? process.env.SKIP_RUMBLE
      : isHeadless
        ? "true"
        : "false";

  const { WDK_SEED: _omit, ...parentEnv } = process.env;
  const env = {
    ...parentEnv,
    DRY_RUN: "false",
    KEEP_BROWSER_OPEN: "true",
    HEADLESS: isHeadless ? "true" : "false",
    SKIP_RUMBLE: skipRumble,
    RUMBLE_USER: "crypto_vib",
    TIP_AMOUNT_SATS: String(tipAmountSats),
    EXPECTED_ADDRESS: expectedAddress,
    BOLTZ_RECIPIENT: agentAddr,
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

    console.log(`[TipSats] ─── Invoice detected, paying immediately ───`);
    console.log(`[TipSats]   Swap ID:  ${swapIdMatch?.[1] ?? "NOT FOUND"}`);
    console.log(`[TipSats]   Agent:    ${agentAddr}`);
    console.log(`[TipSats]   Invoice:  ${bolt11.slice(0, 60)}... (${bolt11.length} chars)`);

    const harnessIdx = HARNESS_STEP_PATTERNS.length;
    updateTipSteps(tipId, makeSteps(harnessIdx)); // "Paying via Lightning" = running

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

      updateTipSteps(tipId, makeSteps(harnessIdx + 2)); // "USDT received by agent" = running

      const txDetails = parseTxDetails(output, result.id, agentAddr);
      if (txDetails) updateTipTxDetails(tipId, txDetails);

      // Wait for USDT to arrive at agent (Boltz settlement takes some time)
      console.log(`[TipSats] Waiting for USDT to arrive at agent ${agentAddr}...`);
      let agentBalance = "0";
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        try {
          agentBalance = await getUsdtBalance();
          console.log(`[TipSats] Agent USDT balance poll ${i + 1}: ${agentBalance}`);
          if (parseFloat(agentBalance) > 0) break;
        } catch (e: any) {
          console.log(`[TipSats] Balance check error: ${e.message}`);
        }
      }

      if (parseFloat(agentBalance) <= 0) {
        console.log(`[TipSats] USDT not yet received; proceeding with batch attempt`);
      }

      updateTipSteps(tipId, makeSteps(harnessIdx + 3)); // "Distributing to creators" = running

      const payoutAddresses = resolvePayoutAddresses(output);
      console.log(
        `[TipSats] Payout recipients (${payoutAddresses.length}): ${payoutAddresses.join(", ")}`
      );

      // Quote the batch fee first, then send balance minus fee
      const balanceNum = parseFloat(agentBalance);
      let feeUsdt = 0.1; // conservative default
      try {
        const provisional = Math.max(0, balanceNum - 0.15).toFixed(6);
        const quoteRecipients = splitEvenUsdt(provisional, payoutAddresses);
        const feeRaw = await quoteBatchTransfer(quoteRecipients);
        feeUsdt = Number(feeRaw) / 1e6; // raw fee is in paymaster token base units (6 decimals)
        console.log(`[TipSats] Estimated batch fee: ${feeUsdt} USDT (raw: ${feeRaw})`);
      } catch (e: any) {
        console.log(`[TipSats] Fee quote failed, using default 0.1 USDT: ${e.message}`);
      }

      const sendAmount = Math.max(0, balanceNum - feeUsdt - 0.01).toFixed(6); // extra 0.01 buffer
      console.log(
        `[TipSats] Distributing ${sendAmount} USDT total (even split, balance: ${agentBalance}, fee: ~${feeUsdt})`
      );

      if (parseFloat(sendAmount) <= 0) {
        throw new Error(`Agent USDT balance (${agentBalance}) too low to cover gas fee (~${feeUsdt} USDT)`);
      }

      const batchRecipients = splitEvenUsdt(sendAmount, payoutAddresses);
      for (const r of batchRecipients) {
        console.log(`[TipSats]   -> ${r.address}: ${r.amountUsdt} USDT`);
      }

      const batchResult = await batchTransferUsdt(batchRecipients);
      console.log(`[TipSats] Batch result: hash=${batchResult.hash}, fee=${batchResult.fee}`);

      if (txDetails) {
        txDetails.batchTxHash = batchResult.hash;
        txDetails.payoutRecipients = batchRecipients;
        updateTipTxDetails(tipId, txDetails);
      }

      updateTipSteps(tipId, ALL_STEP_NAMES.map((name) => ({ name, status: "done" as const })));
      updateTipStatus(tipId, "completed");
    } catch (err: any) {
      console.error(`[TipSats] Pipeline failed: ${err.message}`);
      setTipError(tipId, `Pipeline failed: ${err.message}`);
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
