import type { TipSatsConfig } from "./types";

const sessions = new Map<string, TipSatsConfig>();

export function generateSessionId(): string {
  return `ts_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function saveSession(config: TipSatsConfig): void {
  sessions.set(config.sessionId, config);
}

export function getSession(sessionId: string): TipSatsConfig | undefined {
  return sessions.get(sessionId);
}

export function setAgentAddress(sessionId: string, address: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.agentAddress = address;
  return true;
}
