/**
 * Nostr Wallet Connect (NIP-47) connection string for the backend.
 * Use the same `nostr+walletconnect://…` URL from Alby / other NWC wallets.
 *
 * Future: Lightning zaps (NIP-57) can pay zap invoices via NWC `pay_invoice` / related
 * NIP-47 methods once a client (e.g. @getalby/sdk) is wired here.
 */

import { hexToBytes } from "nostr-tools/utils";

/** Raw NWC URI from env (contains secret — do not log or return to clients). */
export function getNwcConnectionUrl(): string | null {
  const u = process.env.NWC_URL?.trim();
  return u || null;
}

export function isNwcConfigured(): boolean {
  return Boolean(getNwcConnectionUrl());
}

/**
 * Parse non-secret fields from a NWC URI for logs and diagnostics.
 * Does not expose `secret` / `authorization` query params.
 */
export function getNwcPublicMeta(): {
  walletPubkeyHex?: string;
  relayUrl?: string;
} {
  const raw = getNwcConnectionUrl();
  if (!raw) return {};

  try {
    const qIndex = raw.indexOf("?");
    const base = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
    const afterScheme = base.match(/nostr\+walletconnect:\/\/([^/?#]+)/i);
    const walletPubkeyHex = afterScheme?.[1]?.replace(/^\/+/, "") || undefined;

    let relayUrl: string | undefined;
    if (qIndex >= 0) {
      const qs = raw.slice(qIndex + 1).split("#")[0] ?? "";
      const relay = new URLSearchParams(qs).get("relay");
      if (relay) relayUrl = decodeURIComponent(relay);
    }

    return { walletPubkeyHex, relayUrl };
  } catch {
    return {};
  }
}

/**
 * Client `secret` from the NWC URI (64 hex chars) — same material used to sign Nostr events
 * when `NOSTR_PRIVATE_KEY` is not set.
 */
export function getNwcSecretKeyBytes(): Uint8Array | null {
  const raw = getNwcConnectionUrl();
  if (!raw) return null;
  try {
    const qIndex = raw.indexOf("?");
    if (qIndex < 0) return null;
    const qs = raw.slice(qIndex + 1).split("#")[0] ?? "";
    const secret = new URLSearchParams(qs).get("secret");
    if (!secret || !/^[0-9a-fA-F]{64}$/.test(secret)) return null;
    return hexToBytes(secret);
  } catch {
    return null;
  }
}

export function hasNwcSigningSecret(): boolean {
  return getNwcSecretKeyBytes() !== null;
}
