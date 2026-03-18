/**
 * TipSats WDK MCP Server
 *
 * Exposes Tether WDK wallet tools to OpenClaw agents via the Model Context Protocol.
 * The agent uses these tools to check balance, send BTC tips, and manage funds.
 *
 * Tools registered:
 *   - getAddress       (read)  — get the agent's Bitcoin address
 *   - getBalance       (read)  — check balance in satoshis
 *   - getFeeRates      (read)  — current network fee rates
 *   - getMaxSpendableBtc (read) — max spendable after fees
 *   - quoteSendTransaction (read) — estimate fee for a send
 *   - sendTransaction  (write) — send BTC on-chain (requires confirmation)
 *
 * Usage:
 *   WDK_SEED="your 24 word seed phrase" node server.js
 *
 * Or configure in OpenClaw's openclaw.json MCP section.
 */

import { WdkMcpServer, WALLET_TOOLS, PRICING_TOOLS } from '@tetherto/wdk-mcp-toolkit'
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'

const seed = process.env.WDK_SEED
if (!seed) {
  console.error('WDK_SEED environment variable is required')
  process.exit(1)
}

const network = process.env.WDK_NETWORK || 'testnet'
const electrumHost = process.env.WDK_ELECTRUM_HOST || 'electrum.blockstream.info'
const electrumPort = parseInt(process.env.WDK_ELECTRUM_PORT || '50001', 10)

const server = new WdkMcpServer('tipsats-wdk', '1.0.0')

server.useWdk({ seed })

server.registerWallet('bitcoin', WalletManagerBtc, {
  network,
  host: electrumHost,
  port: electrumPort,
})

server.usePricing()

server.registerTools([
  ...WALLET_TOOLS,
  ...PRICING_TOOLS,
])

console.log(`[TipSats WDK MCP] Server ready — network: ${network}`)
