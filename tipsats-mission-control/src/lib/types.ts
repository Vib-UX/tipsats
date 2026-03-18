export type Asset = "BTC" | "USDT" | "XAUT";

export interface Rule {
  minViews: number;
  channelKeywords: string[];
  liveOnly: boolean;
  satsPerHit: number;
  boostOnCampaign: number;
}

export interface TipSatsConfig {
  sessionId: string;
  weeklyBudgetUsd: number;
  assets: { btc: boolean; usdt: boolean; xaut: boolean };
  presets: string[];
  customRules: Rule[];
  network: "bitcoin" | "testnet" | "regtest";
  electrumWsUrl: string;
  agentAddress?: string;
}

export interface DomSnapshot {
  title: string;
  channelName: string;
  views: number;
  likes: number;
  isLive: boolean;
  hasCampaign: boolean;
  secondsWatched: number;
}

export interface PolicyDecision {
  shouldTip: boolean;
  sats: number;
  asset: Asset;
  reason: string;
}

export interface BudgetDecision {
  approved: boolean;
  reason: string;
  remainingSats: number;
}

export const DEFAULT_RULE: Rule = {
  minViews: 5000,
  channelKeywords: [],
  liveOnly: false,
  satsPerHit: 100,
  boostOnCampaign: 0,
};

export const PRESETS: Record<
  string,
  { label: string; description: string; rule: Rule }
> = {
  tech_bitcoin: {
    label: "Tech & Bitcoin",
    description: "100 sats, 10k+ views",
    rule: {
      minViews: 10000,
      channelKeywords: ["bitcoin", "crypto", "tech", "btc", "lightning"],
      liveOnly: false,
      satsPerHit: 100,
      boostOnCampaign: 0,
    },
  },
  gaming_live: {
    label: "Gaming Live",
    description: "50 sats, live only",
    rule: {
      minViews: 2000,
      channelKeywords: ["gaming", "game", "stream", "esports"],
      liveOnly: true,
      satsPerHit: 50,
      boostOnCampaign: 0,
    },
  },
  campaign_boost: {
    label: "Campaign Boost",
    description: "+25% on campaign videos",
    rule: {
      minViews: 1000,
      channelKeywords: [],
      liveOnly: false,
      satsPerHit: 75,
      boostOnCampaign: 25,
    },
  },
};
