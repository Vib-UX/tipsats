"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PRESETS, DEFAULT_RULE, type Rule, type TipSession } from "@/lib/types";

const API = process.env.NEXT_PUBLIC_BACKEND_URL || "";

type Phase = "config" | "funding" | "running" | "complete";

export default function ControlPage() {
  const [budgetSats, setBudgetSats] = useState(2000);
  const [selectedPresets, setSelectedPresets] = useState<string[]>(["tech_bitcoin"]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customRule, setCustomRule] = useState<Rule>({ ...DEFAULT_RULE });

  const [phase, setPhase] = useState<Phase>("config");
  const [tipId, setTipId] = useState<string | null>(null);
  const [bolt11, setBolt11] = useState<string>("");
  const [session, setSession] = useState<TipSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const executedRef = useRef(false);

  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchWallet() {
      try {
        const res = await fetch(`${API}/api/wallet`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setWalletBalance(data.balance);
          setWalletAddress(data.address);
        }
      } catch { /* ignore */ }
    }
    fetchWallet();
    const iv = setInterval(fetchWallet, 15000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  function togglePreset(id: string) {
    setSelectedPresets((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  const budgetUsd = (budgetSats / 1500).toFixed(2);

  const poll = useCallback(async () => {
    if (!tipId) return;
    try {
      const res = await fetch(`${API}/api/tip/${tipId}`);
      if (!res.ok) return;
      const data: TipSession = await res.json();
      setSession(data);

      if (data.status === "funded" && !executedRef.current) {
        executedRef.current = true;
        setPhase("running");
        fetch(`${API}/api/tip/${tipId}/execute`, { method: "POST" }).catch(() => {});
      }
      if (data.status === "agent_running" && phase !== "running") {
        setPhase("running");
      }
      if (data.status === "completed" || data.status === "failed") {
        setPhase("complete");
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        fetch(`${API}/api/wallet`).then(r => r.json()).then(w => {
          setWalletBalance(w.balance);
        }).catch(() => {});
      }
    } catch { /* ignore transient errors */ }
  }, [tipId, phase]);

  useEffect(() => {
    if (!tipId || phase === "config") return;
    pollRef.current = setInterval(poll, 3000);
    poll();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [tipId, phase, poll]);

  async function handleFund() {
    setLoading(true);
    setError(null);
    executedRef.current = false;
    try {
      const res = await fetch(`${API}/api/tip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presets: selectedPresets,
          rules: showAdvanced ? [customRule] : [],
          budgetSats,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create tip");

      setTipId(data.tipId);
      setBolt11(data.bolt11);
      setPhase("funding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleWebLN() {
    try {
      const webln = (window as any).webln;
      if (!webln) {
        setError("No WebLN provider found. Install Alby or another Lightning extension.");
        return;
      }
      await webln.enable();
      await webln.sendPayment(bolt11);
    } catch (err) {
      setError(err instanceof Error ? err.message : "WebLN payment failed");
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(bolt11);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleReset() {
    setPhase("config");
    setTipId(null);
    setBolt11("");
    setSession(null);
    setError(null);
    executedRef.current = false;
    if (pollRef.current) clearInterval(pollRef.current);
  }

  const blockscoutUrl = session?.txDetails?.creatorAddress
    ? `https://polygon.blockscout.com/address/${session.txDetails.creatorAddress}?tab=token_transfers`
    : null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-accent">⚡</span> Mission Control
        </h1>
        <p className="mt-2 text-muted">
          Configure the TipSats agent, fund its Lightning wallet, and watch it tip creators autonomously.
        </p>
      </div>

      {/* Phase indicator */}
      <div className="mb-8 flex items-center gap-2">
        {(["config", "funding", "running", "complete"] as Phase[]).map((p, i) => {
          const order: Phase[] = ["config", "funding", "running", "complete"];
          const currentIdx = order.indexOf(phase);
          const stepIdx = order.indexOf(p);
          const isActive = phase === p;
          const isPast = currentIdx > stepIdx;
          return (
            <div key={p} className="flex items-center gap-2">
              {i > 0 && <div className={`h-px w-8 ${isActive || isPast ? "bg-accent" : "bg-border"}`} />}
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                  isActive ? "bg-accent text-black"
                    : isPast ? "bg-accent/20 text-accent"
                    : "bg-surface-alt text-muted"
                }`}
              >
                {isPast ? "✓" : i + 1}
              </div>
              <span className={`text-xs font-medium ${isActive ? "text-foreground" : "text-muted"}`}>
                {p === "config" ? "Configure" : p === "funding" ? "Fund" : p === "running" ? "Agent" : "Done"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Wallet info */}
      <div className="mb-6 flex items-center gap-4 rounded-xl border border-border bg-surface px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-accent text-sm">⚡</span>
          <span className="text-sm font-medium">Spark Wallet</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <span className="font-mono text-sm font-bold text-accent">
          {walletBalance !== null ? `${walletBalance.toLocaleString()} sats` : "..."}
        </span>
        {walletAddress && (
          <>
            <div className="h-4 w-px bg-border" />
            <span className="font-mono text-[11px] text-muted truncate max-w-[260px]" title={walletAddress}>
              {walletAddress}
            </span>
          </>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-red-200">dismiss</button>
        </div>
      )}

      {/* ═══ Phase 1: Config ═══ */}
      {phase === "config" && (
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h2 className="mb-4 text-lg font-semibold">Agent Budget</h2>
              <div className="mb-2 flex items-baseline justify-between">
                <label className="text-sm font-medium text-muted">Sats to fund</label>
                <div className="text-right">
                  <span className="font-mono text-2xl font-bold text-accent">
                    {budgetSats.toLocaleString()}
                  </span>
                  <span className="ml-2 text-sm text-muted">sats</span>
                  <div className="text-xs text-muted">~${budgetUsd} USD</div>
                </div>
              </div>
              <input
                type="range"
                min={500}
                max={50000}
                step={100}
                value={budgetSats}
                onChange={(e) => setBudgetSats(Number(e.target.value))}
                className="w-full cursor-pointer accent-accent"
              />
              <div className="mt-1 flex justify-between text-xs text-muted">
                <span>500 sats</span>
                <span>50,000 sats</span>
              </div>
            </div>

            <div className="rounded-2xl border border-accent/20 bg-accent/5 p-5 text-sm">
              <p className="leading-relaxed text-muted">
                <strong className="text-accent">How it works:</strong> You&apos;ll pay a Lightning invoice
                to fund the agent&apos;s Spark wallet. The agent then uses those sats to tip a Rumble creator
                via a Boltz atomic swap (LN sats → USDT on Polygon).
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h2 className="mb-4 text-lg font-semibold">Presets &amp; Guardrails</h2>
              <p className="mb-4 text-xs text-muted">
                Presets define which creators the agent targets. The agent evaluates channels against these rules before tipping.
              </p>
              <div className="space-y-3">
                {Object.entries(PRESETS).map(([id, preset]) => (
                  <button
                    key={id}
                    onClick={() => togglePreset(id)}
                    className={`w-full rounded-xl border p-4 text-left transition-all ${
                      selectedPresets.includes(id)
                        ? "border-accent bg-accent/10"
                        : "border-border bg-surface-alt hover:border-muted"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{preset.icon}</span>
                        <span className="font-semibold">{preset.label}</span>
                      </div>
                      <span className={`h-2.5 w-2.5 rounded-full ${
                        selectedPresets.includes(id) ? "bg-accent" : "bg-muted/30"
                      }`} />
                    </div>
                    <p className="mt-1 ml-7 text-sm text-muted">{preset.description}</p>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="mt-4 text-sm font-medium text-accent hover:text-accent-dim transition-colors"
              >
                {showAdvanced ? "▾ Hide" : "▸ Show"} Advanced Rules
              </button>

              {showAdvanced && (
                <div className="mt-4 space-y-3 rounded-xl border border-border bg-background p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted">Min Views</label>
                      <input
                        type="number"
                        value={customRule.minViews}
                        onChange={(e) => setCustomRule({ ...customRule, minViews: Number(e.target.value) })}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted">Sats Per Hit</label>
                      <input
                        type="number"
                        value={customRule.satsPerHit}
                        onChange={(e) => setCustomRule({ ...customRule, satsPerHit: Number(e.target.value) })}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Channel Keywords</label>
                    <input
                      type="text"
                      value={customRule.channelKeywords.join(", ")}
                      onChange={(e) => setCustomRule({
                        ...customRule,
                        channelKeywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      })}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                      placeholder="bitcoin, tech, gaming"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Phase 2: Funding ═══ */}
      {phase === "funding" && (
        <div className="mx-auto max-w-lg space-y-6">
          <div className="rounded-2xl border border-accent/30 bg-surface p-8 text-center">
            <h2 className="mb-2 text-lg font-semibold">Fund the Agent Wallet</h2>
            <p className="mb-6 text-sm text-muted">
              Pay <strong className="text-accent">{budgetSats.toLocaleString()} sats</strong> to activate the agent.
              Scan the QR code or use WebLN.
            </p>

            <div className="mx-auto mb-6 inline-block rounded-2xl bg-white p-4">
              <QRCodeSVG
                value={`lightning:${bolt11}`}
                size={220}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
              />
            </div>

            <div className="space-y-3">
              <button
                onClick={handleWebLN}
                className="w-full rounded-xl bg-accent px-6 py-3 font-semibold text-black transition-colors hover:bg-accent-dim"
              >
                ⚡ Pay with WebLN
              </button>
              <button
                onClick={handleCopy}
                className="w-full rounded-xl border border-border bg-surface-alt px-6 py-3 text-sm font-medium text-foreground transition-colors hover:border-muted"
              >
                {copied ? "✓ Copied!" : "Copy Lightning Invoice"}
              </button>
            </div>

            <div className="mt-4 rounded-lg bg-background p-3">
              <p className="break-all font-mono text-[10px] text-muted leading-relaxed">
                {bolt11}
              </p>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              Waiting for payment — agent starts automatically once paid
            </div>
          </div>

          <button
            onClick={handleReset}
            className="w-full text-center text-sm text-muted hover:text-foreground transition-colors"
          >
            Cancel and go back
          </button>
        </div>
      )}

      {/* ═══ Phase 3: Agent Running ═══ */}
      {(phase === "running" || (phase === "complete" && session?.status !== "completed")) && (
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Agent Running</h2>
              <span className="flex items-center gap-2 rounded-full bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-400">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />
                EXECUTING
              </span>
            </div>
            <p className="mb-6 text-sm text-muted">
              The TipSats agent is browsing Rumble, matching creators to your presets, and executing the tip pipeline.
            </p>

            <div className="space-y-3">
              {(session?.steps?.length ? filterSteps(session.steps) : defaultSteps()).map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    step.status === "done"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : step.status === "running"
                        ? "bg-accent/20 text-accent animate-pulse"
                        : step.status === "error"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-surface-alt text-muted"
                  }`}>
                    {step.status === "done" ? "✓" : step.status === "running" ? "●" : step.status === "error" ? "!" : (i + 1)}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${
                      step.status === "done" ? "text-emerald-400" :
                      step.status === "running" ? "text-accent" :
                      step.status === "error" ? "text-red-400" : "text-muted"
                    }`}>
                      {step.name}
                    </p>
                    {step.detail && (
                      <p className="text-xs text-muted">{step.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Phase 4: Complete ═══ */}
      {phase === "complete" && session?.status === "completed" && session.txDetails && (
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Tip Complete</h2>
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-400">
                SUCCESS
              </span>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-background p-4 font-mono text-sm">
              <Row label="Creator" value={session.txDetails.creator} />
              <Row label="Creator Addr" value={session.txDetails.creatorAddress} mono />
              {session.txDetails.agentAddress && (
                <Row label="Agent Addr" value={session.txDetails.agentAddress} mono />
              )}
              <Row label="Amount" value={`${session.txDetails.amountSats} sats (~${session.txDetails.amountUsdt} USDT)`} />
              <Row label="Swap ID" value={session.txDetails.swapId} />
              <Row label="LN Payment" value={session.txDetails.paymentId} />
              <Row label="Boltz Swap">
                <a
                  href={session.txDetails.boltzUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:text-accent-dim transition-colors"
                >
                  View on Boltz
                </a>
              </Row>
              {session.txDetails.batchTxHash && (
                <Row label="Batch Payout">
                  <a
                    href={`https://polygon.blockscout.com/tx/${session.txDetails.batchTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    View on Blockscout
                  </a>
                </Row>
              )}
              {session.txDetails.payoutRecipients &&
                session.txDetails.payoutRecipients.length > 0 && (
                  <Row label="Split (USDT)">
                    <ul className="list-inside list-disc space-y-1 text-xs break-all">
                      {session.txDetails.payoutRecipients.map((r) => (
                        <li key={r.address}>
                          {r.amountUsdt} → {r.address}
                        </li>
                      ))}
                    </ul>
                  </Row>
                )}
              {blockscoutUrl && (
                <Row label="Creator Txns">
                  <a
                    href={blockscoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    View on Blockscout
                  </a>
                </Row>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
              <div className="flex items-center gap-2">
                <span className="text-purple-400 text-sm font-medium">Featured on Nostr</span>
                <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-semibold text-purple-400">COMING SOON</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                This tip will be broadcast on the Nostr social graph, amplifying {session.txDetails.creator}&apos;s visibility.
              </p>
            </div>
          </div>

          <button
            onClick={handleReset}
            className="w-full rounded-xl border border-border bg-surface px-6 py-3 font-medium text-foreground transition-colors hover:border-accent hover:bg-surface-alt"
          >
            Tip Another Creator
          </button>
        </div>
      )}

      {/* Failed state */}
      {phase === "complete" && session?.status === "failed" && (
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
            <h2 className="mb-2 text-lg font-semibold text-red-400">Pipeline Failed</h2>
            <p className="text-sm text-muted">{session.error || "An unknown error occurred"}</p>
          </div>
          <button
            onClick={handleReset}
            className="w-full rounded-xl border border-border bg-surface px-6 py-3 font-medium text-foreground transition-colors hover:border-accent hover:bg-surface-alt"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Fund button (config phase) */}
      {phase === "config" && (
        <div className="mt-10 text-center">
          <button
            onClick={handleFund}
            disabled={loading || !selectedPresets.length}
            className="inline-flex items-center gap-3 rounded-2xl bg-accent px-10 py-4 text-lg font-bold text-black shadow-lg shadow-accent/20 transition-all hover:bg-accent-dim hover:shadow-accent/30 disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-black/20 border-t-black" />
                Creating Invoice...
              </>
            ) : (
              <>⚡ Fund Agent — {budgetSats.toLocaleString()} sats</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono, children }: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-muted">{label}</span>
      {children || (
        <span className={`text-right break-all ${mono ? "text-xs" : ""} text-foreground`}>
          {value}
        </span>
      )}
    </div>
  );
}

const HIDDEN_STEPS = new Set(["Initializing Spark wallet", "Wallet ready"]);

function filterSteps(steps: { name: string; status: string; detail?: string }[]) {
  return steps.filter((s) => !HIDDEN_STEPS.has(s.name));
}

function defaultSteps(): { name: string; status: "pending" | "running" | "done" | "error"; detail?: string }[] {
  return [
    { name: "Launching browser", status: "running" },
    { name: "Browsing Rumble", status: "pending" },
    { name: "Creator found", status: "pending" },
    { name: "Creating atomic swap", status: "pending" },
    { name: "Swap created", status: "pending" },
    { name: "Lightning invoice ready", status: "pending" },
    { name: "Paying via Lightning", status: "pending" },
    { name: "Payment confirmed", status: "pending" },
    { name: "USDT received by agent", status: "pending" },
    { name: "Distributing to creators", status: "pending" },
  ];
}
