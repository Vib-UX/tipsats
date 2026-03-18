---
name: tipsats
version: 1.0.0
description: Autonomous Rumble tipping using Tether WDK and OpenClaw browser
author: TipSats
tags: [bitcoin, tipping, rumble, wdk, browser-automation]
tools: [browser, wdk-mcp]
---

# TipSats Skill — Autonomous Rumble Tipping

This skill teaches an OpenClaw agent to browse Rumble.com autonomously and tip creators with Bitcoin using the Tether WDK.

## Prerequisites

- OpenClaw browser enabled (profile: `openclaw` or `headless`)
- Tether WDK MCP server running with a funded Bitcoin wallet
- A TipSats session config from Mission Control

## Step 1: Fetch Session Config

```bash
curl -s https://tipsats.app/api/session/{SESSION_ID}
```

The config contains:
- `presets`: array of preset IDs (e.g. `["tech_bitcoin", "gaming_live"]`)
- `customRules`: array of `{ minViews, channelKeywords, liveOnly, satsPerHit, boostOnCampaign }`
- `assets`: `{ btc: true, usdt: false, xaut: false }`
- `network`: `"bitcoin"` | `"testnet"` | `"regtest"`
- `electrumWsUrl`: WebSocket URL for the Electrum server
- `weeklyBudgetUsd`: max weekly spend in USD

## Step 2: Check WDK Wallet

Use the WDK MCP tools to verify the wallet is funded:

1. Call `getAddress` with `chain: "bitcoin"` to get the agent's BTC address
2. Call `getBalance` with `chain: "bitcoin"` to check balance in satoshis
3. If balance is 0, report the address to the user and wait for funding
4. Report address back to Mission Control: `PUT /api/session/{id}` with `{ address }`

## Step 3: Browse Rumble

Navigate the OpenClaw browser to Rumble:

1. `browser_navigate("https://rumble.com")`
2. `browser_snapshot()` — get the page structure
3. Identify video links from the homepage (look for video thumbnails, titles, hrefs containing `/v/` or video IDs)
4. Click on a video to navigate to it

## Step 4: Perception — Read the Video Page

After navigating to a video page, take a snapshot and extract:

```json
{
  "title": "Video title from <h1> or page title",
  "channelName": "Creator name from channel link/header",
  "views": 12500,
  "likes": 340,
  "isLive": false,
  "hasCampaign": false
}
```

**Where to find these on Rumble's DOM:**
- Title: `<h1>` element or `document.title`
- Channel: `.media-by--a`, `.channel-header--title`, or `[class*='channel'] a`
- Views: `.media-heading-info`, `[class*='views']`
- Likes: `.rumbles-vote-pill--votes`, `[class*='like'] .count`
- Live: `.live-indicator`, `.is-live`, `[class*='live-badge']`
- Campaign: `.campaign-badge`, `[class*='campaign']`, `[class*='promoted']`

Parse view/like counts: "12.5K" → 12500, "1.2M" → 1200000.

## Step 5: Policy — Decide Whether to Tip

Apply the user's rules in order. First matching rule wins.

### Preset rules:

**tech_bitcoin**: minViews=10000, keywords=[bitcoin,crypto,tech,btc,lightning], liveOnly=false, satsPerHit=100
**gaming_live**: minViews=2000, keywords=[gaming,game,stream,esports], liveOnly=true, satsPerHit=50
**campaign_boost**: minViews=1000, keywords=[], liveOnly=false, satsPerHit=75, boostOnCampaign=25%

### Matching logic:

```
for each rule:
  if rule.liveOnly and NOT isLive → skip
  if views < rule.minViews → skip
  if rule.channelKeywords is non-empty:
    if none of the keywords appear in title or channelName (case-insensitive) → skip
  → MATCH: tip = rule.satsPerHit
  if hasCampaign and rule.boostOnCampaign > 0:
    tip = tip * (1 + boostOnCampaign/100)
```

If no rule matches → don't tip this video.

## Step 6: Budget — Check Balance

Before tipping, verify:
1. Call `getBalance` (chain: "bitcoin") to get current sats
2. If tip amount > balance → reject, stop browsing
3. Call `quoteSendTransaction` to estimate fee
4. If tip + fee > balance → reject

## Step 7: Action — Execute the Tip

This is the key step. Use the browser to interact with Rumble's tip UI:

1. **Find the tip button**: `browser_snapshot()`, look for elements matching:
   - `button[class*="tip"]`, `button[title*="Tip"]`, `.tip-button`, `[data-action="tip"]`
2. **Click it**: `browser_click(ref)`
3. **Wait for modal**: `browser_wait(2000)` then `browser_snapshot()`
4. **Look for "other wallet" option**: Click it to get the creator's BTC address
5. **Extract the BTC address**: Look for:
   - `[class*="address"]`, `code`, `input[readonly]`, `.qr-address`
   - The address should start with `bc1` (mainnet) or `tb1` (testnet)
6. **Send via WDK**: Call `sendTransaction` with:
   ```json
   { "chain": "bitcoin", "to": "<creator_address>", "value": "<sats_as_string>" }
   ```
7. **Record the tx hash** from the response
8. **Close the modal** and continue browsing

If you can't find the tip button or extract an address, skip this video and move on.

## Step 8: Navigate to Next Video

After tipping (or skipping), go to the next video:

1. Navigate back to the homepage or use Rumble's "Up Next" / related videos
2. Pick a video you haven't visited yet in this session
3. Repeat from Step 4

## Step 9: Completion

Stop when:
- Wallet balance reaches 0 (or too low for a tip + fee)
- All accessible videos have been processed
- The session has been running for the configured time limit

On completion, report final stats:
- Total tips sent
- Total sats spent
- Transaction hashes
- Remaining balance

## Error Handling

- If a browser action fails, take a snapshot and retry once
- If WDK sendTransaction fails, log the error and skip the video
- If Rumble's UI doesn't show a tip button, skip and move on
- Never retry a failed transaction (could double-spend)

## Example Session Flow

```
1. Fetch config for session ts_abc123
2. WDK getBalance → 50000 sats
3. Navigate to rumble.com
4. Click video: "Bitcoin 2025 Recap" by CryptoDaily (45K views)
5. Policy: matches tech_bitcoin → tip 100 sats
6. Budget: 100 < 50000 → approved
7. Click tip button → modal opens → extract bc1q...xyz
8. WDK sendTransaction(bc1q...xyz, 100) → tx: a1b2c3...
9. Navigate to next video...
10. Repeat until balance exhausted
```
