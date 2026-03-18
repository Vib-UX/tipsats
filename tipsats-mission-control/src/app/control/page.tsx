"use client";

import { useState, useEffect, useCallback } from "react";
import { PRESETS, DEFAULT_RULE, type Rule } from "@/lib/types";

type AgentStatus = "idle" | "starting" | "running" | "stopped" | "error";

export default function ControlPage() {
  const [budget, setBudget] = useState(25);
  const [assets, setAssets] = useState({ btc: true, usdt: false, xaut: false });
  const [selectedPresets, setSelectedPresets] = useState<string[]>(["tech_bitcoin"]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customRule, setCustomRule] = useState<Rule>({ ...DEFAULT_RULE });
  const [network, setNetwork] = useState<"bitcoin" | "testnet" | "regtest">("testnet");

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>("idle");
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [agentLog, setAgentLog] = useState<string[]>([]);

  function togglePreset(id: string) {
    setSelectedPresets((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function toggleAsset(key: keyof typeof assets) {
    setAssets((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // Poll session for agent updates
  const pollSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/session/${sessionId}`);
      const data = await res.json();
      if (data.agentAddress && data.agentAddress !== agentAddress) {
        setAgentAddress(data.agentAddress);
      }
    } catch { /* ignore */ }
  }, [sessionId, agentAddress]);

  useEffect(() => {
    if (!sessionId || agentStatus !== "running") return;
    const iv = setInterval(pollSession, 5000);
    return () => clearInterval(iv);
  }, [sessionId, agentStatus, pollSession]);

  async function handleLaunch() {
    setAgentStatus("starting");
    setAgentLog(["Creating session..."]);

    try {
      // 1. Create session
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weeklyBudgetUsd: budget,
          assets,
          presets: selectedPresets,
          customRules: showAdvanced ? [customRule] : [],
          network,
        }),
      });
      const { sessionId: sid } = await res.json();
      setSessionId(sid);
      setAgentLog((l) => [...l, `Session: ${sid}`]);

      // 2. Trigger OpenClaw agent
      setAgentLog((l) => [...l, "Starting OpenClaw agent..."]);
      const agentRes = await fetch("/api/agent/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid }),
      });

      if (agentRes.ok) {
        setAgentStatus("running");
        setAgentLog((l) => [...l, "Agent is browsing Rumble autonomously"]);
      } else {
        const err = await agentRes.json();
        setAgentStatus("error");
        setAgentLog((l) => [...l, `Error: ${err.error || "Failed to start agent"}`]);
      }
    } catch (err) {
      setAgentStatus("error");
      setAgentLog((l) => [...l, `Error: ${err instanceof Error ? err.message : "Unknown"}`]);
    }
  }

  async function handleStop() {
    if (!sessionId) return;
    setAgentLog((l) => [...l, "Stopping agent..."]);
    try {
      await fetch("/api/agent/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      setAgentStatus("stopped");
      setAgentLog((l) => [...l, "Agent stopped"]);
    } catch {
      setAgentLog((l) => [...l, "Failed to stop agent"]);
    }
  }

  const isConfigurable = agentStatus === "idle" || agentStatus === "stopped" || agentStatus === "error";

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">Mission Control</h1>
        <p className="mt-2 text-muted">
          Configure tipping rules. The OpenClaw agent will browse Rumble in its own
          browser and tip creators using a Tether WDK wallet.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left: Budget & Assets */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="mb-4 text-lg font-semibold">Budget &amp; Assets</h2>

            <div className="mb-6">
              <div className="mb-2 flex items-baseline justify-between">
                <label className="text-sm font-medium text-muted">Weekly Budget</label>
                <span className="font-mono text-2xl font-bold text-accent">${budget}</span>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                disabled={!isConfigurable}
                className="w-full cursor-pointer accent-accent disabled:opacity-50"
              />
              <div className="mt-1 flex justify-between text-xs text-muted">
                <span>$1</span>
                <span>$100</span>
              </div>
            </div>

            <div>
              <label className="mb-3 block text-sm font-medium text-muted">Tipping Assets</label>
              <div className="flex gap-3">
                {([
                  { key: "btc" as const, label: "BTC (sats)", icon: "₿" },
                  { key: "usdt" as const, label: "USDT", icon: "$" },
                  { key: "xaut" as const, label: "XAUt", icon: "Au" },
                ] as const).map(({ key, label, icon }) => (
                  <button
                    key={key}
                    onClick={() => toggleAsset(key)}
                    disabled={!isConfigurable}
                    className={`flex-1 rounded-xl border p-3 text-center text-sm font-medium transition-all disabled:opacity-50 ${
                      assets[key]
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border bg-surface-alt text-muted hover:border-muted"
                    }`}
                  >
                    <span className="mb-1 block text-xl">{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-muted">BTC Network</label>
              <select
                value={network}
                onChange={(e) => setNetwork(e.target.value as typeof network)}
                disabled={!isConfigurable}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none disabled:opacity-50"
              >
                <option value="testnet">Testnet (recommended for demo)</option>
                <option value="bitcoin">Mainnet</option>
                <option value="regtest">Regtest</option>
              </select>
            </div>
          </div>

          {/* Agent status */}
          <div className={`rounded-2xl border p-5 ${
            agentStatus === "running"
              ? "border-emerald-500/30 bg-emerald-500/5"
              : agentStatus === "error"
                ? "border-red-500/30 bg-red-500/5"
                : "border-border bg-surface"
          }`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted">Agent Status</h3>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                agentStatus === "running" ? "bg-emerald-500/15 text-emerald-400" :
                agentStatus === "starting" ? "bg-amber-500/15 text-amber-400" :
                agentStatus === "error" ? "bg-red-500/15 text-red-400" :
                "bg-surface-alt text-muted"
              }`}>
                {agentStatus.toUpperCase()}
              </span>
            </div>

            {agentAddress && (
              <div className="mb-3 font-mono text-xs">
                <span className="text-muted">WDK Wallet: </span>
                <span className="text-foreground">{agentAddress}</span>
              </div>
            )}

            <div className="space-y-1 max-h-40 overflow-y-auto font-mono text-xs text-muted">
              {agentLog.map((line, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-accent/50 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                  <span>{line}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Presets & Rules */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="mb-4 text-lg font-semibold">Presets &amp; Rules</h2>

            <div className="space-y-3">
              {Object.entries(PRESETS).map(([id, preset]) => (
                <button
                  key={id}
                  onClick={() => togglePreset(id)}
                  disabled={!isConfigurable}
                  className={`w-full rounded-xl border p-4 text-left transition-all disabled:opacity-60 ${
                    selectedPresets.includes(id)
                      ? "border-accent bg-accent/10"
                      : "border-border bg-surface-alt hover:border-muted"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{preset.label}</span>
                    <span className={`h-2.5 w-2.5 rounded-full ${
                      selectedPresets.includes(id) ? "bg-accent" : "bg-muted/30"
                    }`} />
                  </div>
                  <p className="mt-1 text-sm text-muted">{preset.description}</p>
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

          {/* Architecture diagram */}
          <div className="rounded-2xl border border-border bg-surface p-5 font-mono text-xs leading-relaxed">
            <div className="text-accent font-bold mb-2">Agent Architecture</div>
            <div className="ml-2 space-y-0.5 text-muted">
              <div><span className="text-foreground">OpenClaw Gateway</span></div>
              <div className="ml-3">├── <span className="text-blue-400">Perception</span> browser_snapshot → extract video data</div>
              <div className="ml-3">├── <span className="text-purple-400">Policy</span> match rules → decide sats</div>
              <div className="ml-3">├── <span className="text-amber-400">Budget</span> WDK getBalance → approve/reject</div>
              <div className="ml-3">├── <span className="text-emerald-400">Action</span> browser_click + WDK sendTransaction</div>
              <div className="ml-3">└── <span className="text-accent">WDK MCP</span> self-custodial Bitcoin wallet</div>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-10 text-center space-x-4">
        {(agentStatus === "idle" || agentStatus === "stopped" || agentStatus === "error") && (
          <button
            onClick={handleLaunch}
            disabled={!Object.values(assets).some(Boolean)}
            className="inline-flex items-center gap-3 rounded-2xl bg-accent px-10 py-4 text-lg font-bold text-black shadow-lg shadow-accent/20 transition-all hover:bg-accent-dim hover:shadow-accent/30 disabled:opacity-50"
          >
            {agentStatus === "idle" ? "Launch Agent" : "Relaunch Agent"}
          </button>
        )}

        {agentStatus === "starting" && (
          <button
            disabled
            className="inline-flex items-center gap-3 rounded-2xl bg-accent/50 px-10 py-4 text-lg font-bold text-black"
          >
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-black/20 border-t-black" />
            Starting...
          </button>
        )}

        {agentStatus === "running" && (
          <button
            onClick={handleStop}
            className="inline-flex items-center gap-3 rounded-2xl bg-red-500 px-10 py-4 text-lg font-bold text-white shadow-lg shadow-red-500/20 transition-all hover:bg-red-600"
          >
            Stop Agent
          </button>
        )}
      </div>
    </div>
  );
}
