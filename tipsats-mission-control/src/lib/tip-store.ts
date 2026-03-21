import type { TipSession, TipStatus, PipelineStep, TxDetails, Rule } from "./types";

const tips = new Map<string, TipSession>();

export function generateTipId(): string {
  return `tip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createTip(params: {
  id: string;
  presets: string[];
  rules: Rule[];
  budgetSats: number;
  invoiceBolt11: string;
  invoiceId: string;
}): TipSession {
  const session: TipSession = {
    id: params.id,
    presets: params.presets,
    rules: params.rules,
    budgetSats: params.budgetSats,
    invoiceBolt11: params.invoiceBolt11,
    invoiceId: params.invoiceId,
    status: "invoice_created",
    steps: [],
    txDetails: null,
    walletBalanceSats: 0,
    createdAt: Date.now(),
  };
  tips.set(session.id, session);
  return session;
}

export function getTip(id: string): TipSession | undefined {
  return tips.get(id);
}

export function updateTipStatus(id: string, status: TipStatus): void {
  const tip = tips.get(id);
  if (tip) tip.status = status;
}

export function updateTipSteps(id: string, steps: PipelineStep[]): void {
  const tip = tips.get(id);
  if (tip) tip.steps = steps;
}

export function updateTipTxDetails(id: string, txDetails: TxDetails): void {
  const tip = tips.get(id);
  if (tip) tip.txDetails = txDetails;
}

export function updateTipBalance(id: string, balanceSats: number): void {
  const tip = tips.get(id);
  if (tip) tip.walletBalanceSats = balanceSats;
}

export function setTipError(id: string, error: string): void {
  const tip = tips.get(id);
  if (tip) {
    tip.status = "failed";
    tip.error = error;
  }
}
