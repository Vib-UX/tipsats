import WalletManagerSpark from "@tetherto/wdk-wallet-spark";

type SparkAccount = Awaited<ReturnType<WalletManagerSpark["getAccount"]>>;

let walletInstance: WalletManagerSpark | null = null;
let accountInstance: SparkAccount | null = null;
let initPromise: Promise<void> | null = null;
let paymentInProgress = false;
let lastKnownBalance = 0;

async function ensureInit(): Promise<{ wallet: WalletManagerSpark; account: SparkAccount }> {
  if (walletInstance && accountInstance) {
    return { wallet: walletInstance, account: accountInstance };
  }

  if (initPromise) {
    await initPromise;
    return { wallet: walletInstance!, account: accountInstance! };
  }

  const seed = process.env.WDK_SEED;
  if (!seed) {
    throw new Error("WDK_SEED environment variable is required");
  }

  initPromise = (async () => {
    walletInstance = new WalletManagerSpark(seed, { network: "MAINNET" });
    accountInstance = await walletInstance.getAccount(0);
  })();

  await initPromise;
  return { wallet: walletInstance!, account: accountInstance! };
}

export async function getBalance(): Promise<number> {
  if (paymentInProgress) return lastKnownBalance;
  const { account } = await ensureInit();
  const balance = await account.getBalance();
  lastKnownBalance = Number(balance);
  return lastKnownBalance;
}

export async function getAddress(): Promise<string> {
  const { account } = await ensureInit();
  return await account.getAddress();
}

export interface InvoiceResult {
  invoiceId: string;
  bolt11: string;
  amountSats: number;
  expiresAt: string;
}

export async function createInvoice(
  amountSats: number,
  memo = "Fund TipSats agent wallet"
): Promise<InvoiceResult> {
  const { account } = await ensureInit();
  const result = await account.createLightningInvoice({ amountSats, memo });
  const r = result as any;
  return {
    invoiceId: r.id,
    bolt11: r.invoice?.encodedInvoice ?? r.encodedInvoice ?? "",
    amountSats,
    expiresAt: r.invoice?.expiresAt ?? r.expiresAt ?? "",
  };
}

export interface PaymentResult {
  id: string;
  fee: number;
}

export async function quotePayInvoice(bolt11: string): Promise<number> {
  const { account } = await ensureInit();
  const estimate = await account.quotePayLightningInvoice({
    encodedInvoice: bolt11,
  });
  return Number(estimate);
}

export async function payInvoice(
  bolt11: string,
  maxFeeSats = 1000
): Promise<PaymentResult> {
  const { account } = await ensureInit();
  paymentInProgress = true;
  console.log("[TipSats] Payment lock acquired");

  try {
    const payment = await account.payLightningInvoice({
      invoice: bolt11,
      maxFeeSats,
    } as any);

    const id = (payment as any).id ?? "unknown";
    const fee = (payment as any).fee;
    const rawFee = fee?.originalValue != null ? Number(fee.originalValue) : 0;
    const unit: string = fee?.originalUnit ?? "";
    const feeSats = unit === "MILLISATOSHI" ? Math.round(rawFee / 1000) : rawFee;
    console.log(`[TipSats] payLightningInvoice returned: id=${id}, fee=${feeSats} sats`);

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const req = await account.getLightningSendRequest(id);
        const status = (req as any)?.status as string;
        console.log(`[TipSats] Payment poll ${i + 1}: ${status}`);
        if (status === "TRANSFER_COMPLETED" || status === "LIGHTNING_PAYMENT_SUCCEEDED" || (req as any)?.paymentPreimage) {
          return { id, fee: feeSats };
        }
        if (status === "LIGHTNING_PAYMENT_FAILED" || status === "TRANSFER_FAILED") {
          throw new Error(`Lightning payment failed with status: ${status}`);
        }
      } catch (err: any) {
        if (err.message?.includes("failed")) throw err;
      }
    }

    console.log(`[TipSats] Payment ${id} still pending after 60s`);
    return { id, fee: feeSats };
  } finally {
    paymentInProgress = false;
    console.log("[TipSats] Payment lock released");
  }
}

export type InvoiceStatus = "pending" | "paid" | "expired" | "failed";

export async function checkInvoiceStatus(invoiceId: string): Promise<InvoiceStatus> {
  if (paymentInProgress) return "pending";
  const { account } = await ensureInit();
  const req = await account.getLightningReceiveRequest(invoiceId);
  if (!req) return "pending";

  const status = (req as any).status as string;
  if (
    status === "TRANSFER_COMPLETED" ||
    status === "LIGHTNING_PAYMENT_RECEIVED" ||
    status === "PAYMENT_PREIMAGE_RECOVERED"
  ) {
    return "paid";
  }
  if (status === "TRANSFER_FAILED" || status === "TRANSFER_CREATION_FAILED") {
    return "failed";
  }
  return "pending";
}
