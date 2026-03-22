/**
 * NWC (@getalby/sdk) / nostr-tools expect `globalThis.WebSocket` (browser API).
 * Node.js does not define it — use the `ws` package.
 */
import { WebSocket as WsConstructor } from "ws";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: typeof WsConstructor }).WebSocket = WsConstructor;
}
