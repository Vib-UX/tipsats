import WalletManagerEvmErc4337 from "@tetherto/wdk-wallet-evm-erc-4337";

const USDT_POLYGON = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const SAFE_MODULES_VERSION = "0.3.0";
const PIMLICO_PAYMASTER = "0x777777777777AeC03fd955926DbF81597e66834C";

type Evm4337Account = Awaited<ReturnType<WalletManagerEvmErc4337["getAccount"]>>;

/** WDK returns a user operation hash; explorers need the executed L2 transaction hash. */
const RECEIPT_POLL_MS = 2000;
const RECEIPT_MAX_WAIT_MS = 10 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function txHashFromReceipt(receipt: unknown): string {
  const r = receipt as { hash?: string; transactionHash?: string };
  const h = r.hash ?? r.transactionHash;
  if (!h || typeof h !== "string") {
    throw new Error("Transaction receipt missing on-chain transaction hash");
  }
  return h;
}

/**
 * Poll until the user op is included; returns the Polygon transaction hash for block explorers.
 */
async function waitForOnChainTxHash(
  account: Evm4337Account,
  userOpHash: string,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < RECEIPT_MAX_WAIT_MS) {
    const receipt = await account.getTransactionReceipt(userOpHash);
    if (receipt) {
      return txHashFromReceipt(receipt);
    }
    await sleep(RECEIPT_POLL_MS);
  }
  throw new Error(
    `Timed out after ${RECEIPT_MAX_WAIT_MS / 1000}s waiting for on-chain tx (userOpHash=${userOpHash})`,
  );
}

let walletInstance: WalletManagerEvmErc4337 | null = null;
let accountInstance: Evm4337Account | null = null;
let initPromise: Promise<void> | null = null;

function buildConfig() {
  const seed = process.env.WDK_SEED;
  if (!seed) throw new Error("WDK_SEED is required for ERC-4337");

  const pimlicoKey = process.env.PIMLICO_API_KEY;
  if (!pimlicoKey) throw new Error("PIMLICO_API_KEY is required for ERC-4337");

  const provider = process.env.POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com";
  const pimlicoBase = `https://api.pimlico.io/v2/137/rpc?apikey=${pimlicoKey}`;

  return {
    seed,
    config: {
      chainId: 137,
      provider,
      bundlerUrl: pimlicoBase,
      paymasterUrl: pimlicoBase,
      paymasterAddress: PIMLICO_PAYMASTER,
      entryPointAddress: ENTRY_POINT,
      safeModulesVersion: SAFE_MODULES_VERSION,
      paymasterToken: { address: USDT_POLYGON },
      transferMaxFee: 500_000, // 0.5 USDT max gas fee (6 decimals)
    },
  };
}

async function ensureInit(): Promise<{ wallet: WalletManagerEvmErc4337; account: Evm4337Account }> {
  if (walletInstance && accountInstance) {
    return { wallet: walletInstance, account: accountInstance };
  }

  if (initPromise) {
    await initPromise;
    return { wallet: walletInstance!, account: accountInstance! };
  }

  initPromise = (async () => {
    const { seed, config } = buildConfig();
    walletInstance = new WalletManagerEvmErc4337(seed, config);
    accountInstance = await walletInstance.getAccount(0);
    const addr = await accountInstance.getAddress();
    console.log(`[TipSats-4337] ERC-4337 agent address: ${addr}`);
  })();

  await initPromise;
  return { wallet: walletInstance!, account: accountInstance! };
}

/** Polygon smart-account address (counterfactual Safe). */
export async function getAgentAddress(): Promise<string> {
  const { account } = await ensureInit();
  return await account.getAddress();
}

/** USDT balance on Polygon (6 decimals). Returns human-readable string like "1.50". */
export async function getUsdtBalance(): Promise<string> {
  const { account } = await ensureInit();
  const raw = await account.getTokenBalance(USDT_POLYGON);
  const units = Number(raw) / 1e6;
  return units.toFixed(6);
}

export interface TransferRecipient {
  address: string;
  /** USDT amount in human-readable form, e.g. "0.50" */
  amountUsdt: string;
}

export interface BatchResult {
  /** On-chain Polygon transaction hash (safe for Blockscout / `tx/` URLs). */
  hash: string;
  /** ERC-4337 user operation hash returned by the bundler (before resolution). */
  userOpHash: string;
  fee: string;
  recipients: number;
}

/**
 * Batch-transfer USDT to multiple recipients in one UserOperation.
 * Uses sendTransaction([...]) with encoded ERC-20 transfer calls.
 */
export async function batchTransferUsdt(recipients: TransferRecipient[]): Promise<BatchResult> {
  if (!recipients.length) throw new Error("No recipients");
  const { account } = await ensureInit();

  if (recipients.length === 1) {
    const r = recipients[0];
    const amount = Math.round(parseFloat(r.amountUsdt) * 1e6);
    console.log(`[TipSats-4337] Single transfer: ${r.amountUsdt} USDT -> ${r.address}`);
    const result = await account.transfer({
      token: USDT_POLYGON,
      recipient: r.address,
      amount,
    });
    const userOpHash = result.hash;
    const onChainHash = await waitForOnChainTxHash(account, userOpHash);
    console.log(`[TipSats-4337] Resolved on-chain tx: ${onChainHash} (userOp: ${userOpHash})`);
    return {
      hash: onChainHash,
      userOpHash,
      fee: result.fee?.toString() ?? "0",
      recipients: 1,
    };
  }

  const txs = recipients.map((r) => {
    const amount = Math.round(parseFloat(r.amountUsdt) * 1e6);
    const amountHex = BigInt(amount).toString(16).padStart(64, "0");
    const addrPadded = r.address.slice(2).toLowerCase().padStart(64, "0");
    // ERC-20 transfer(address,uint256) selector = 0xa9059cbb
    const data = `0xa9059cbb${addrPadded}${amountHex}`;
    return { to: USDT_POLYGON, value: 0n, data };
  });

  console.log(`[TipSats-4337] Batch transfer: ${recipients.length} recipients`);
  for (const r of recipients) {
    console.log(`  -> ${r.address}: ${r.amountUsdt} USDT`);
  }

  const result = await (account as any).sendTransaction(txs);
  const userOpHash = result.hash as string;
  const onChainHash = await waitForOnChainTxHash(account, userOpHash);
  console.log(`[TipSats-4337] Resolved on-chain tx: ${onChainHash} (userOp: ${userOpHash})`);

  return {
    hash: onChainHash,
    userOpHash,
    fee: result.fee?.toString() ?? "0",
    recipients: recipients.length,
  };
}

/** Quote a batch (fee estimate without sending). */
export async function quoteBatchTransfer(recipients: TransferRecipient[]): Promise<string> {
  if (!recipients.length) throw new Error("No recipients");
  const { account } = await ensureInit();

  const txs = recipients.map((r) => {
    const amount = Math.round(parseFloat(r.amountUsdt) * 1e6);
    const amountHex = BigInt(amount).toString(16).padStart(64, "0");
    const addrPadded = r.address.slice(2).toLowerCase().padStart(64, "0");
    const data = `0xa9059cbb${addrPadded}${amountHex}`;
    return { to: USDT_POLYGON, value: 0n, data };
  });

  const quote = await (account as any).quoteSendTransaction(txs);
  return quote.fee?.toString() ?? "0";
}

export { USDT_POLYGON };
