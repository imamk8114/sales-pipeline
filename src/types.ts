export const STAGES = [
  "New Lead",
  "Contacted",
  "Demo Done",
  "Proposal Sent",
  "Negotiation",
  "Won",
  "Lost",
] as const;

export type Stage = (typeof STAGES)[number];

export type SyncStatus = "idle" | "saving" | "error";

export interface Deal {
  id: string;
  company: string;
  amount: number;
  licences: number;
  owner: string;
  stage: Stage;
  createdAt: number;
  updatedAt: number;
  stageChangedAt: number;
  syncStatus: SyncStatus;
  lastError?: string;
  retryCount: number;
  /** true for a few seconds after a remote (teammate) change, drives a subtle highlight */
  remoteFlashAt?: number;
}

export interface FakeApiConfig {
  minLatencyMs: number;
  maxLatencyMs: number;
  failRate: number; // 0..1
  teammateIntervalMs: number;
  teammateBatchSize: number;
  teammatesEnabled: boolean;
}
