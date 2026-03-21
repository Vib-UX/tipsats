import Link from "next/link";

const steps = [
  {
    num: "01",
    title: "Set guardrails & fund",
    desc: "Pick presets — Tech & Bitcoin, Gaming, Campaign Boost. Set a sats budget. Pay the Lightning invoice to fund the agent wallet.",
    icon: "⚙️",
  },
  {
    num: "02",
    title: "Agent browses Rumble",
    desc: "The TipSats agent launches an isolated browser, navigates Rumble, and discovers creators matching your rules. Fully autonomous.",
    icon: "🔍",
  },
  {
    num: "03",
    title: "Tip via Lightning",
    desc: "The agent creates a Boltz atomic swap, pays the Lightning invoice via Spark wallet, and the creator receives USDT on Polygon.",
    icon: "⚡",
  },
];

const features = [
  {
    title: "Lightning Micro-Payments",
    desc: "On-chain Bitcoin fees often exceed the tip itself. Lightning via Tether Spark makes sub-dollar tips practical — fast and nearly free.",
    accent: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  {
    title: "Agentic Automation",
    desc: "An OpenClaw-style agent browses Rumble autonomously, evaluates creators against your preset rules, and executes tips without manual intervention.",
    accent: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  {
    title: "Nostr Social Layer",
    desc: "Each tip is featured on Nostr — extending Tether WDK with a Nostr client to amplify creator visibility across the decentralized social graph.",
    accent: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
  },
  {
    title: "Self-Custodial",
    desc: "Your Spark wallet seed stays on your machine. Private keys never leave your device. The agent can only spend what you fund.",
    accent: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
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
              TETHER SPARK WALLET + LIGHTNING + NOSTR
            </span>
          </div>
          <h1 className="animate-fade-up-delay-1 mt-4 text-5xl font-bold leading-tight tracking-tight md:text-6xl">
            <span className="text-accent">TipSats:</span> Agentic Lightning
            <br />
            Tipping for Rumble
          </h1>
          <p className="animate-fade-up-delay-2 mx-auto mt-6 max-w-2xl text-lg text-muted">
            Rumble&apos;s wallet doesn&apos;t support Lightning. Bitcoin on-chain fees
            often exceed the tip. <strong className="text-foreground">TipSats</strong> solves
            this — an autonomous agent tips your favourite creators with Lightning
            sats, bridged to USDT via Boltz atomic swaps. Cheap, fast, self-custodial.
          </p>
          <div className="animate-fade-up-delay-3 mt-10 flex items-center justify-center gap-4">
            <Link
              href="/control"
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-8 py-3.5 text-base font-semibold text-black shadow-lg shadow-accent/20 transition-all hover:bg-accent-dim hover:shadow-accent/30"
            >
              Launch Agent
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Problem / Solution */}
      <section className="mx-auto max-w-4xl px-6 py-12">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
            <h3 className="mb-2 font-semibold text-red-400">The Problem</h3>
            <p className="text-sm leading-relaxed text-muted">
              Rumble supports crypto tipping but lacks Lightning. On-chain BTC fees
              can be <strong className="text-foreground">$2-5+</strong> per transaction — making
              micro-tips of a few hundred sats economically pointless.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
            <h3 className="mb-2 font-semibold text-emerald-400">The TipSats Solution</h3>
            <p className="text-sm leading-relaxed text-muted">
              Pay with <strong className="text-foreground">Lightning sats</strong> via
              Tether Spark wallet. Boltz Exchange bridges the payment to
              USDT on Polygon — the creator receives it in their Rumble wallet.
              Fees: <strong className="text-foreground">&lt; 10 sats</strong>.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="mb-12 text-center text-3xl font-bold tracking-tight">
          How it works
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.num}
              className="group rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-accent/40 hover:bg-surface-alt"
            >
              <div className="mb-3 flex items-center gap-3">
                <span className="text-2xl">{s.icon}</span>
                <span className="font-mono text-sm font-bold text-accent">{s.num}</span>
              </div>
              <h3 className="mb-2 text-lg font-semibold">{s.title}</h3>
              <p className="text-sm leading-relaxed text-muted">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="mb-12 text-center text-3xl font-bold tracking-tight">
          Why Lightning + Spark
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className={`rounded-2xl border ${f.border} ${f.bg} p-6`}
            >
              <h3 className={`mb-2 font-semibold ${f.accent}`}>{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted">{f.desc}</p>
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
          <div className="text-accent font-bold">TipSats Agent Pipeline</div>
          <div className="ml-4 mt-2 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-muted">├──</span>
              <span className="rounded bg-accent/10 px-2 py-0.5 text-accent">Spark Wallet</span>
              <span className="text-muted">self-custodial Lightning via Tether WDK</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted">├──</span>
              <span className="rounded bg-blue-500/10 px-2 py-0.5 text-blue-400">Browser Agent</span>
              <span className="text-muted">isolated Chrome — browses Rumble</span>
            </div>
            <div className="ml-4 text-muted mt-1 mb-1 space-y-0.5">
              <div className="ml-4">├── <span className="text-blue-400">Discover</span> — find creators matching presets</div>
              <div className="ml-4">├── <span className="text-purple-400">Extract</span> — get creator&apos;s USDT address from tip modal</div>
              <div className="ml-4">├── <span className="text-amber-400">Swap</span> — Boltz atomic swap: LN sats → USDT Polygon</div>
              <div className="ml-4">└── <span className="text-emerald-400">Pay</span> — Spark payLightningInvoice</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted">├──</span>
              <span className="rounded bg-purple-500/10 px-2 py-0.5 text-purple-400">Nostr Client</span>
              <span className="text-muted">feature tips on the social graph</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted">└──</span>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-400">Mission Control</span>
              <span className="text-muted">config + real-time pipeline view</span>
            </div>
          </div>
        </div>
      </section>

      {/* Credits */}
      <section className="mx-auto max-w-3xl px-6 pb-24">
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="mb-4 text-sm font-medium text-muted">Powered by</p>
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
            <a
              href="https://docs.wdk.tether.io/sdk/wallet-modules/wallet-spark/usage"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-accent/20 bg-accent/5 px-4 py-2 font-medium text-accent transition-colors hover:bg-accent/10"
            >
              Tether Spark Wallet Kit
            </a>
            <a
              href="https://beta.boltz.exchange/"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-2 font-medium text-blue-400 transition-colors hover:bg-blue-500/10"
            >
              Boltz Exchange
            </a>
            <span className="rounded-lg border border-purple-500/20 bg-purple-500/5 px-4 py-2 font-medium text-purple-400">
              Nostr Protocol
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
