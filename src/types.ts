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
  /**
   * Bumped every time a save is *initiated* for this deal (a move or a manual
   * retry — not the automatic backoff retries of the same save). A queued
   * save's response is only applied if this still matches the deal's current
   * version when the response comes back; otherwise a newer edit has already
   * superseded it and the stale response is a no-op. Prevents a slow/failed
   * save for an old value from clobbering a newer edit that already saved.
   */
  version: number;
}

export interface FakeApiConfig {
  minLatencyMs: number;
  maxLatencyMs: number;
  failRate: number; // 0..1
  teammateIntervalMs: number;
  teammateBatchSize: number;
  teammatesEnabled: boolean;
}
