# Tools

## Browser
Use the OpenClaw managed browser (profile: `openclaw`) for all Rumble browsing.
- `browser_navigate` — go to a URL
- `browser_snapshot` — get page structure and element refs
- `browser_click` — click an element by ref
- `browser_type` — type text into an element
- `browser_wait` — wait for page changes (use short incremental waits)

## WDK (via MCP)
The Tether WDK MCP server provides self-custodial wallet tools:
- `getAddress` — get wallet address
- `getBalance` — check balance (satoshis)
- `sendTransaction` — send BTC on-chain
- `quoteSendTransaction` — estimate fee
- `getMaxSpendable` — max spendable after fees

## Mission Control API
- `GET /api/session/{id}` — fetch session config (rules, presets, budget)
- `PUT /api/session/{id}` — report agent wallet address back

## Conventions
- Always take a snapshot before clicking anything
- Use short waits (1-3s) between actions, not long sleeps
- Log all wallet operations to the session transcript
- Prefer `browser_snapshot` over screenshots for structured data
