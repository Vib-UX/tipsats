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
  fundedSats?: string;
  agentUsdtReceived?: string;
  reservedForGasUsdt?: string;
  distributedUsdt?: string;
  tipSplitCapUsdt?: string;
  payoutRecipients?: {
    address: string;
    amountUsdt: string;
    percent?: number;
    label?: string;
    channelUrl?: string;
  }[];
  nostrEventId?: string;
  nostrRelayUrl?: string;
  nostrShareUrl?: string;
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
