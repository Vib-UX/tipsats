import Link from "next/link";

const steps = [
  {
    num: "01",
    title: "Set budget, presets & rules",
    desc: "Pick a weekly budget, tipping assets (BTC sats, USDT, XAUt), and define which Rumble creators get tipped.",
  },
  {
    num: "02",
    title: "Launch the agent",
    desc: "One click starts an OpenClaw agent with its own browser profile. It navigates Rumble autonomously — you don't need Rumble open.",
  },
  {
    num: "03",
    title: "Agent browses, evaluates, tips",
    desc: "The agent reads each video page, matches your rules, and sends sats on-chain via Tether WDK. Fully autonomous, fully self-custodial.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-accent/5 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-4xl px-6 py-28 text-center">
          <div className="animate-fade-up">
            <span className="mb-4 inline-block rounded-full border border-accent/30 bg-accent/10 px-4 py-1 text-xs font-medium tracking-wide text-accent">
              OPENCLAW AGENT + TETHER WDK
            </span>
          </div>
          <h1 className="animate-fade-up-delay-1 mt-4 text-5xl font-bold leading-tight tracking-tight md:text-6xl">
            <span className="text-accent">TipSats:</span> Autonomous Sats
            <br />
            Tipping for Rumble
          </h1>
          <p className="animate-fade-up-delay-2 mx-auto mt-6 max-w-xl text-lg text-muted">
            An AI agent browses Rumble for you and tips creators with Bitcoin.
            Self-custodial via Tether WDK. Orchestrated by OpenClaw.
          </p>
          <div className="animate-fade-up-delay-3 mt-10">
            <Link
              href="/control"
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-8 py-3.5 text-base font-semibold text-black shadow-lg shadow-accent/20 transition-all hover:bg-accent-dim hover:shadow-accent/30"
            >
              Open Mission Control
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="mb-12 text-center text-3xl font-bold tracking-tight">
          How it works
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.num}
              className="group rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-accent/40 hover:bg-surface-alt"
            >
              <span className="mb-3 inline-block font-mono text-sm font-bold text-accent">
                {s.num}
              </span>
              <h3 className="mb-2 text-lg font-semibold">{s.title}</h3>
              <p className="text-sm leading-relaxed text-muted">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Architecture */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="mb-8 text-center text-3xl font-bold tracking-tight">
          Architecture
        </h2>

        <div className="rounded-2xl border border-border bg-surface p-8 font-mono text-sm leading-relaxed">
          <div className="text-accent font-bold">OpenClaw Gateway</div>
          <div className="ml-4 mt-2 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-muted">├──</span>
              <span className="rounded bg-accent/10 px-2 py-0.5 text-accent">Browser Profile</span>
              <span className="text-muted">isolated Chrome — surfs Rumble</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted">├──</span>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-400">WDK MCP Server</span>
              <span className="text-muted">Bitcoin wallet tools</span>
            </div>
            <div className="ml-4 text-muted mt-1 mb-1 space-y-0.5">
              <div className="ml-4">├── <span className="text-blue-400">Perception</span> — snapshot → extract video data</div>
              <div className="ml-4">├── <span className="text-purple-400">Policy</span> — match rules → decide tip amount</div>
              <div className="ml-4">├── <span className="text-amber-400">Budget</span> — WDK getBalance() → approve</div>
              <div className="ml-4">└── <span className="text-emerald-400">Action</span> — browser click + WDK sendTransaction()</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted">└──</span>
              <span className="rounded bg-blue-500/10 px-2 py-0.5 text-blue-400">Mission Control</span>
              <span className="text-muted">config UI + session API</span>
            </div>
          </div>
        </div>

        {/* WDK detail */}
        <div className="mt-4 rounded-2xl border border-border bg-surface p-6 text-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground">Tether WDK — Agent Wallet</h3>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-0.5 text-xs font-medium text-emerald-400">
              Self-Custodial
            </span>
          </div>
          <p className="leading-relaxed text-muted">
            The agent has its own{" "}
            <code className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-xs text-accent">
              @tetherto/wdk
            </code>{" "}
            wallet exposed via the{" "}
            <code className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-xs text-accent">
              @tetherto/wdk-mcp-toolkit
            </code>
            . The WDK MCP server registers Bitcoin wallet tools:{" "}
            <code className="font-mono text-xs text-muted">getBalance</code>,{" "}
            <code className="font-mono text-xs text-muted">sendTransaction</code>,{" "}
            <code className="font-mono text-xs text-muted">getMaxSpendable</code>,{" "}
            <code className="font-mono text-xs text-muted">quoteSendTransaction</code>.
            The seed phrase stays local — private keys never leave your machine.
          </p>
        </div>

        {/* OpenClaw detail */}
        <div className="mt-4 rounded-2xl border border-border bg-surface p-6 text-sm">
          <h3 className="mb-3 font-semibold text-foreground">OpenClaw — Agent Runtime</h3>
          <p className="leading-relaxed text-muted">
            The agent runs inside the{" "}
            <strong className="text-foreground">OpenClaw Gateway</strong> with an
            isolated browser profile. It navigates Rumble autonomously using
            browser tools (<code className="font-mono text-xs text-muted">navigate</code>,{" "}
            <code className="font-mono text-xs text-muted">snapshot</code>,{" "}
            <code className="font-mono text-xs text-muted">click</code>,{" "}
            <code className="font-mono text-xs text-muted">type</code>).
            Each task (perception, policy, budget, action) can run as a sub-agent
            for parallel orchestration. The user doesn&apos;t need Rumble open — the
            agent has its own browser.
          </p>
        </div>
      </section>

      {/* Safety */}
      <section className="mx-auto max-w-3xl px-6 pb-24">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-xl">&#x1F6E1;&#xFE0F;</span>
            <div>
              <h3 className="font-semibold text-emerald-400">Self-Custodial &amp; Safe</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                The agent&apos;s WDK wallet seed phrase is stored locally on your
                machine. The OpenClaw browser profile is isolated from your
                personal browser. No private keys leave your device. The agent
                can only spend what&apos;s in its funded wallet — it can&apos;t
                access your other accounts. Withdraw remaining funds anytime.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
