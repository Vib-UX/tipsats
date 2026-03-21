import { NWCClient } from "@getalby/sdk";

export type NwcClient = NWCClient;

export interface NwcWallet {
  client: NwcClient;
  balanceSats: number;
}

export interface PaymentResult {
  preimage: string;
  feesPaid: number;
}

export async function initNwc(nwcUrl: string): Promise<NwcWallet> {
  const client = new NWCClient({
    nostrWalletConnectUrl: nwcUrl,
  });
  const { balance } = await client.getBalance();
  return { client, balanceSats: balance };
}

export async function payInvoice(
  client: NwcClient,
  bolt11: string
): Promise<PaymentResult> {
  const result = await client.payInvoice({ invoice: bolt11 });
  return {
    preimage: result.preimage,
    feesPaid: (result as any).fees_paid ?? 0,
  };
}
