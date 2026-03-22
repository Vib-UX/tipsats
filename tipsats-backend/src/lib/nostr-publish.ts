import { finalizeEvent, getPublicKey, nip19 } from "nostr-tools";
import { hexToBytes } from "nostr-tools/utils";
import type { Event } from "nostr-tools";
import WebSocket from "ws";
import type { PayoutChannelMeta } from "./payout-config.js";
import type { TxDetails } from "./types.js";
import { getNwcPublicMeta, getNwcSecretKeyBytes } from "./nwc-config.js";

export interface NostrPublishInput {
  tx: TxDetails;
  channels: PayoutChannelMeta[];
}

export interface NostrPublishOk {
  nostrEventId: string;
  nostrRelayUrl: string;
  nostrShareUrl: string;
}

export interface NostrPublishErr {
  nostrPublishError: string;
}

function parseSecretKey(raw: string | undefined): Uint8Array | null {
  const s = raw?.trim();
  if (!s) return null;
  if (s.startsWith("nsec1")) {
    try {
      const decoded = nip19.decode(s);
      if (decoded.type !== "nsec") return null;
      return decoded.data as Uint8Array;
    } catch {
      return null;
    }
  }
  if (/^[0-9a-fA-F]{64}$/.test(s)) {
    return hexToBytes(s);
  }
  return null;
}

/** Comma-separated `NOSTR_RELAY_URLS`, else single `NOSTR_RELAY_URL`, else NWC relay + damus + nos.lol. */
function relayUrlsForWebSocket(): string[] {
  const multi = process.env.NOSTR_RELAY_URLS?.trim();
  if (multi) {
    return multi
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean);
  }
  const single = process.env.NOSTR_RELAY_URL?.trim();
  if (single) return [single];

  const defaults = ["wss://relay.damus.io", "wss://nos.lol"];
  const nwcRelay = getNwcPublicMeta().relayUrl;
  if (nwcRelay) {
    const rest = defaults.filter((u) => u !== nwcRelay);
    return [nwcRelay, ...rest];
  }
  return defaults;
}

function buildNoteContent(
  tx: TxDetails,
  channels: PayoutChannelMeta[],
): string {
  const lines: string[] = [
    "TipSats — Lightning → USDT payout on Polygon",
    "",
    `Rumble creator: ${tx.creator}`,
    "",
    "Channels:",
  ];

  for (const ch of channels) {
    const desc = ch.description?.trim();
    lines.push(`• ${ch.label}`);
    if (ch.url) lines.push(`  ${ch.url}`);
    if (desc) lines.push(`  ${desc}`);
  }

  lines.push("");
  lines.push(
    `Tip: ${tx.fundedSats ?? tx.amountSats} sats (swap ~${tx.amountUsdt} USDT).`,
  );
  if (tx.distributedUsdt) {
    lines.push(`Sent to creators: ${tx.distributedUsdt} USDT.`);
  }
  if (tx.batchTxHash) {
    lines.push(
      `Polygon batch: https://polygon.blockscout.com/tx/${tx.batchTxHash}`,
    );
  }
  lines.push("");
  lines.push("#tipsats #bitcoin");

  return lines.join("\n");
}

function shareUrlForEvent(eventId: string): string {
  const template =
    process.env.NOSTR_NOTE_URL_TEMPLATE?.trim() || "https://njump.me/{eventId}";
  return template.replace(/\{eventId\}/g, eventId);
}

/** NIP-01: send EVENT, wait for OK. */
function publishViaWebSocket(
  relayUrl: string,
  event: Event,
  timeoutMs = 45_000,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const ws = new WebSocket(relayUrl);

    const done = (result: { ok: true } | { ok: false; reason: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      done({ ok: false, reason: `relay timeout (${timeoutMs}ms, no OK)` });
    }, timeoutMs);

    ws.on("open", () => {
      ws.send(JSON.stringify(["EVENT", event]));
    });

    ws.on("message", (raw: WebSocket.RawData) => {
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!Array.isArray(msg) || msg.length < 3) return;
      if (msg[0] !== "OK") return;
      if (msg[1] !== event.id) return;
      if (msg[2] === true) {
        done({ ok: true });
      } else {
        const reason =
          typeof msg[3] === "string" && msg[3]
            ? msg[3]
            : "relay rejected event";
        done({ ok: false, reason });
      }
    });

    ws.on("error", (err: Error) => {
      done({ ok: false, reason: `websocket: ${err.message}` });
    });

    ws.on("close", () => {
      if (!settled) {
        done({ ok: false, reason: "connection closed before relay OK" });
      }
    });
  });
}

async function publishViaHttpBridge(
  base: string,
  relayUrl: string,
  signed: Event,
): Promise<NostrPublishOk | NostrPublishErr> {
  let res: Response;
  try {
    res = await fetch(`${base}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        relayUrl,
        event: signed,
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { nostrPublishError: `http-nostr request failed: ${msg}` };
  }

  const text = await res.text();
  let body: { eventId?: string; relayUrl?: string };
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    return {
      nostrPublishError: `http-nostr returned non-JSON (${res.status}): ${text.slice(0, 200)}`,
    };
  }

  if (!res.ok) {
    return {
      nostrPublishError: `http-nostr ${res.status}: ${text.slice(0, 300)}`,
    };
  }

  const eventId = body.eventId ?? signed.id;
  const outRelay = body.relayUrl ?? relayUrl;
  if (!eventId) {
    return { nostrPublishError: "http-nostr response missing eventId" };
  }

  return {
    nostrEventId: eventId,
    nostrRelayUrl: outRelay,
    nostrShareUrl: shareUrlForEvent(eventId),
  };
}

/** Same signed event to each relay; success if at least one returns NIP-01 OK. */
async function publishToRelaysWebSocket(
  relayUrls: string[],
  event: Event,
): Promise<NostrPublishOk | NostrPublishErr> {
  const outcomes = await Promise.all(
    relayUrls.map(async (url) => {
      const r = await publishViaWebSocket(url, event);
      return { url, r };
    }),
  );

  const okUrls = outcomes.filter((o) => o.r.ok).map((o) => o.url);
  if (okUrls.length > 0) {
    return {
      nostrEventId: event.id,
      nostrRelayUrl: okUrls.join(", "),
      nostrShareUrl: shareUrlForEvent(event.id),
    };
  }

  const msg = outcomes
    .filter(
      (o): o is { url: string; r: { ok: false; reason: string } } => !o.r.ok,
    )
    .map((o) => `${o.url}: ${o.r.reason}`)
    .join("; ");
  return {
    nostrPublishError: msg || "all relays failed",
  };
}

/**
 * Publish a kind 1 note.
 * - If `HTTP_NOSTR_BASE_URL` (or `HTTP_NOSTR_URL`) is set: POST to http-nostr `/publish` (single relay from env).
 * - Otherwise: WebSocket to each URL in `NOSTR_RELAY_URLS` or `NOSTR_RELAY_URL`, else default `wss://relay.damus.io` + `wss://nos.lol`.
 *
 * Requires `NOSTR_PRIVATE_KEY` (64-char hex or `nsec1…`), or `NWC_URL` with `secret=` (64 hex).
 */
export async function publishTipNote(
  input: NostrPublishInput,
): Promise<NostrPublishOk | NostrPublishErr> {
  const sk =
    parseSecretKey(process.env.NOSTR_PRIVATE_KEY) ?? getNwcSecretKeyBytes();
  if (!sk) {
    return {
      nostrPublishError:
        "No signing key: set NOSTR_PRIVATE_KEY (hex/nsec) or NWC_URL with secret= (64 hex chars)",
    };
  }

  const pkHex = getPublicKey(sk);
  console.log(`[TipSats] Nostr pubkey (hex): ${pkHex}`);

  const wsRelayUrls = relayUrlsForWebSocket();
  const primaryRelayForHttp =
    process.env.NOSTR_RELAY_URL?.trim() ||
    wsRelayUrls[0] ||
    "wss://relay.damus.io";

  const content = buildNoteContent(input.tx, input.channels);
  // `EventTemplate` has no `pubkey`; `finalizeEvent` sets it from `sk` (same as your NWC hex flow).
  const signed = finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["client", "tipsats"],
        ["t", "tipsats"],
      ],
      content,
    },
    sk,
  );

  const base =
    process.env.HTTP_NOSTR_BASE_URL?.replace(/\/$/, "") ||
    process.env.HTTP_NOSTR_URL?.replace(/\/$/, "");

  if (base) {
    return publishViaHttpBridge(base, primaryRelayForHttp, signed);
  }

  return publishToRelaysWebSocket(wsRelayUrls, signed);
}
