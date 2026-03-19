import WDK from "@tetherto/wdk";
import WalletManagerEvm from "@tetherto/wdk-wallet-evm";

const USDT_POLYGON = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
const USDT_DECIMALS = 6;

export interface WalletInfo {
  address: string;
  usdtBalance: bigint;
  maticBalance: bigint;
}

export interface TipResult {
  hash: string;
  fee: string;
}

export function formatUsdt(raw: bigint): string {
  const whole = raw / BigInt(10 ** USDT_DECIMALS);
  const frac = raw % BigInt(10 ** USDT_DECIMALS);
  return `${whole}.${frac.toString().padStart(USDT_DECIMALS, "0")}`;
}

export function parseUsdt(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDT_DECIMALS));
}

export async function initWallet(
  seedPhrase: string,
  rpcUrl: string
): Promise<{
  info: WalletInfo;
  transfer: (recipient: string, amount: bigint) => Promise<TipResult>;
  quoteTransfer: (
    recipient: string,
    amount: bigint
  ) => Promise<{ fee: string }>;
}> {
  const wdk = new WDK(seedPhrase).registerWallet(
    "polygon",
    WalletManagerEvm,
    { provider: rpcUrl }
  );

  const account = await wdk.getAccount("polygon", 0);
  const address = await account.getAddress();
  const usdtBalance = await account.getTokenBalance(USDT_POLYGON);
  const maticBalance = await account.getBalance();

  const info: WalletInfo = {
    address,
    usdtBalance: BigInt(usdtBalance.toString()),
    maticBalance: BigInt(maticBalance.toString()),
  };

  async function transfer(
    recipient: string,
    amount: bigint
  ): Promise<TipResult> {
    const result = await account.transfer({
      token: USDT_POLYGON,
      recipient,
      amount,
    });
    return { hash: result.hash, fee: result.fee?.toString() ?? "unknown" };
  }

  async function quoteTransfer(
    recipient: string,
    amount: bigint
  ): Promise<{ fee: string }> {
    const quote = await account.quoteTransfer({
      token: USDT_POLYGON,
      recipient,
      amount,
    });
    return { fee: quote.fee?.toString() ?? "unknown" };
  }

  return { info, transfer, quoteTransfer };
}
