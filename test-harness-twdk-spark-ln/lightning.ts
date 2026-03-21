import WalletManagerSpark from "@tetherto/wdk-wallet-spark";

type SparkAccount = Awaited<ReturnType<WalletManagerSpark["getAccount"]>>;

export interface SparkWallet {
  wallet: WalletManagerSpark;
  account: SparkAccount;
  address: string;
  balanceSats: number;
}

export interface PaymentResult {
  id: string;
  fee: number;
}

export async function initSpark(seedPhrase: string): Promise<SparkWallet> {
  const wallet = new WalletManagerSpark(seedPhrase, { network: "MAINNET" });
  const account = await wallet.getAccount(0);
  const address = await account.getAddress();
  const balance = await account.getBalance();

  return {
    wallet,
    account,
    address,
    balanceSats: Number(balance),
  };
}

export async function quotePayInvoice(
  account: SparkAccount,
  bolt11: string
): Promise<number> {
  const estimate = await account.quotePayLightningInvoice({
    encodedInvoice: bolt11,
  });
  return Number(estimate);
}

export async function payInvoice(
  account: SparkAccount,
  bolt11: string,
  maxFeeSats = 1000
): Promise<PaymentResult> {
  const payment = await account.payLightningInvoice({
    invoice: bolt11,
    maxFeeSats,
  } as any);

  const id = (payment as any).id ?? "unknown";
  const fee = (payment as any).fee;
  const rawFee = fee?.originalValue != null ? Number(fee.originalValue) : 0;
  const unit: string = fee?.originalUnit ?? "";
  const feeSats = unit === "MILLISATOSHI" ? Math.round(rawFee / 1000) : rawFee;

  return { id, fee: feeSats };
}
