export type PipelineStepLike = { name: string; status: string; detail?: string };

/** Map backend / harness step names to the front pipeline story. */
export function mapPipelineStepDisplay(step: PipelineStepLike): {
  title: string;
  detail?: string;
} {
  const table: Record<string, { title: string; detail?: string }> = {
    "Launching browser": {
      title: "Open Rumble",
      detail: "Isolated browser — discovery session",
    },
    "Browsing Rumble": {
      title: "Search & filter channels",
      detail: "Uses your presets and guardrails (views, subscribers, keywords)",
    },
    "Creator found": {
      title: "Open profiles · copy channel IDs",
      detail: "Channels that match your rules for this run",
    },
    "Creating atomic swap": {
      title: "Create Boltz swap",
      detail: "Lightning → USDT on Polygon (agent custody)",
    },
    "Swap created": {
      title: "Atomic swap ready",
      detail: "Awaiting Lightning invoice payment",
    },
    "Lightning invoice ready": {
      title: "Lightning invoice ready",
      detail: "Invoice copied to clipboard in harness",
    },
    "Paying via Lightning": {
      title: "Pay via Spark wallet",
      detail: "Lightning payment to Boltz invoice",
    },
    "Payment confirmed": {
      title: "Lightning settled",
      detail: "Boltz routes USDT to agent",
    },
    "USDT received by agent": {
      title: "USDT received by agent",
      detail: "ERC-4337 wallet on Polygon",
    },
    "Distributing to creators": {
      title: "Send USDT to creators",
      detail: "Boltz → agent wallet, then weighted batch (65/35 of received after gas reserve)",
    },
    "Broadcasting on Nostr": {
      title: "Broadcast on Nostr",
      detail: "Kind-1 note with channel info via http-nostr",
    },
  };

  const mapped = table[step.name];
  if (mapped) return mapped;
  return { title: step.name, detail: step.detail };
}
