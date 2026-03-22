export interface Rule {
  minViews: number;
  /** 0 = no minimum subscriber filter */
  minSubscribers: number;
  /** 0 = no maximum (unbounded) */
  maxSubscribers: number;
  channelKeywords: string[];
  liveOnly: boolean;
  satsPerHit: number;
  boostOnCampaign: number;
}

export const DEFAULT_RULE: Rule = {
  minViews: 5000,
  /** Playwright / demo default: 5k–35k subscriber band */
  minSubscribers: 5000,
  maxSubscribers: 35000,
  channelKeywords: [],
  liveOnly: false,
  satsPerHit: 100,
  boostOnCampaign: 0,
};

export const PRESETS: Record<
  string,
  { label: string; description: string; icon: string; rule: Rule }
> = {
  tech_bitcoin: {
    label: "Tech & Bitcoin",
    description: "Bitcoin, crypto, and tech creators — 100 sats, 10k+ views",
    icon: "₿",
    rule: {
      minViews: 10000,
      minSubscribers: 0,
      maxSubscribers: 0,
      channelKeywords: ["bitcoin", "crypto", "tech", "btc", "lightning"],
      liveOnly: false,
      satsPerHit: 100,
      boostOnCampaign: 0,
    },
  },
  gaming_live: {
    label: "Gaming Live",
    description: "Live gaming streams — 50 sats, 2k+ views",
    icon: "🎮",
    rule: {
      minViews: 2000,
      minSubscribers: 0,
      maxSubscribers: 0,
      channelKeywords: ["gaming", "game", "stream", "esports"],
      liveOnly: true,
      satsPerHit: 50,
      boostOnCampaign: 0,
    },
  },
  campaign_boost: {
    label: "Campaign Boost",
    description: "+25% boost for campaign videos — 75 sats base",
    icon: "🚀",
    rule: {
      minViews: 1000,
      minSubscribers: 0,
      maxSubscribers: 0,
      channelKeywords: [],
      liveOnly: false,
      satsPerHit: 75,
      boostOnCampaign: 25,
    },
  },
};

export type TipStatus =
  | "invoice_created"
  | "funded"
  | "agent_running"
  | "completed"
  | "failed";

export interface PipelineStep {
  name: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
}

export interface TxDetails {
  swapId: string;
  paymentId: string;
  creator: string;
  creatorAddress: string;
  agentAddress: string;
  amountSats: string;
  amountUsdt: string;
  boltzUrl: string;
  batchTxHash?: string;
  /** Invoice / funded amount in sats (same as session budget for this tip) */
  fundedSats?: string;
  /** USDT balance on agent when batch runs (Boltz proceeds landed) */
  agentUsdtReceived?: string;
  /** Paymaster fee + buffer — not included in creator split */
  reservedForGasUsdt?: string;
  /** Total USDT sent to creators (65/35 of this pool, after gas reserve) */
  distributedUsdt?: string;
  /** USDT amount attributed to this tip (Boltz quote); split uses min(agent, this), not full wallet */
  tipSplitCapUsdt?: string;
  /** Per-recipient USDT amounts when batch split is used */
  payoutRecipients?: {
    address: string;
    amountUsdt: string;
    percent?: number;
    label?: string;
    channelUrl?: string;
  }[];
  /** Published kind-1 note id (hex) when http-nostr succeeds */
  nostrEventId?: string;
  /** Relay used for publish (from bridge response or request) */
  nostrRelayUrl?: string;
  /** Open in a Nostr web client (default njump.me; override with NOSTR_NOTE_URL_TEMPLATE) */
  nostrShareUrl?: string;
  /** Set when publish was attempted but failed */
  nostrPublishError?: string;
}

export interface TipSession {
  id: string;
  presets: string[];
  rules: Rule[];
  budgetSats: number;
  invoiceBolt11: string;
  invoiceId: string;
  status: TipStatus;
  steps: PipelineStep[];
  txDetails: TxDetails | null;
  walletBalanceSats: number;
  createdAt: number;
  error?: string;
}
