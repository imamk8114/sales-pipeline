import { Deal, FakeApiConfig, STAGES, Stage } from "../types";

const OWNERS = [
  "Priya",
  "Rahul",
  "Ananya",
  "Vikram",
  "Sneha",
  "Arjun",
  "Kavya",
  "Rohan",
  "Meera",
  "Karan",
];

const COMPANY_PREFIXES = [
  "Acme",
  "Globex",
  "Initech",
  "Umbrella",
  "Stark",
  "Wayne",
  "Wonka",
  "Hooli",
  "Pied Piper",
  "Soylent",
  "Vandelay",
  "Cyberdyne",
  "Massive Dynamic",
  "Oscorp",
  "Aperture",
  "Tyrell",
  "Gringotts",
  "Monsters Inc",
  "Prestige",
  "Dunder Mifflin",
];

const COMPANY_SUFFIXES = ["Corp", "Ltd", "Industries", "Solutions", "Labs", "Group", "Systems", "Partners", "Holdings", "Technologies"];

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);

function pick<T>(arr: readonly T[], rng: () => number = rand): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function generateDeals(count: number): Deal[] {
  const deals: Deal[] = [];
  const now = Date.now();
  const weightedStages = [
    ...Array(5).fill(STAGES[0]),
    ...Array(5).fill(STAGES[1]),
    ...Array(5).fill(STAGES[2]),
    ...Array(5).fill(STAGES[3]),
    ...Array(5).fill(STAGES[4]),
    ...Array(2).fill(STAGES[5]), // Won
    ...Array(2).fill(STAGES[6]), // Lost
  ];
  for (let i = 0; i < count; i++) {
    const stage = pick(weightedStages); // most deals sit in active stages; a smaller slice already closed
    const daysAgo = Math.floor(rand() * 120);
    const stageDaysAgo = Math.min(daysAgo, Math.floor(rand() * 45));
    const createdDaysAgo = daysAgo + Math.floor(rand() * 90); // the lead always existed before its last update
    deals.push({
      id: `deal-${i}`,
      company: `${pick(COMPANY_PREFIXES)} ${pick(COMPANY_SUFFIXES)} #${i}`,
      amount: Math.round((5_000 + rand() * 495_000) / 500) * 500,
      licences: Math.round(5 + rand() * 495),
      owner: pick(OWNERS),
      stage,
      createdAt: now - createdDaysAgo * 86_400_000,
      updatedAt: now - daysAgo * 86_400_000,
      stageChangedAt: now - stageDaysAgo * 86_400_000,
      syncStatus: "idle",
      retryCount: 0,
      version: 0,
    });
  }
  return deals;
}

export const OWNER_LIST = OWNERS;

export const defaultConfig: FakeApiConfig = {
  minLatencyMs: 300,
  maxLatencyMs: 1500,
  failRate: 0.1,
  teammateIntervalMs: 2000,
  teammateBatchSize: 1,
  teammatesEnabled: true,
};

let config: FakeApiConfig = { ...defaultConfig };

export function getApiConfig(): FakeApiConfig {
  return config;
}

export function setApiConfig(patch: Partial<FakeApiConfig>) {
  config = { ...config, ...patch };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simulates a network PATCH to update a deal. Resolves with the patch on success,
 * rejects with an Error on simulated failure. Latency and failure rate are
 * configurable via setApiConfig so the UI can be stress-tested live.
 */
export async function updateDealRemote(
  id: string,
  patch: Partial<Pick<Deal, "stage" | "owner">>
): Promise<Partial<Deal>> {
  const { minLatencyMs, maxLatencyMs, failRate } = config;
  const latency = minLatencyMs + Math.random() * Math.max(0, maxLatencyMs - minLatencyMs);
  await delay(latency);
  if (Math.random() < failRate) {
    throw new Error("Network error: request timed out");
  }
  return patch;
}

export type TeammateChange = { id: string; patch: Partial<Deal> };

/** A single random teammate-style edit for one deal (stage / owner / amount). */
export function randomTeammateChangeFor(id: string): TeammateChange {
  const roll = Math.random();
  if (roll < 0.6) {
    return { id, patch: { stage: pick(STAGES, Math.random) } };
  }
  if (roll < 0.85) {
    return { id, patch: { owner: pick(OWNERS, Math.random) } };
  }
  return { id, patch: { amount: Math.round((5_000 + Math.random() * 495_000) / 500) * 500 } };
}

/**
 * Starts a fake "teammates editing the same pipeline" feed. Every tick it mutates
 * a small random batch of deals (stage / owner change) and calls back with the
 * change so the UI can merge it in.
 */
export function subscribeTeammateChanges(
  allIds: string[],
  onChange: (changes: TeammateChange[]) => void
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;

  function tick() {
    if (stopped) return;
    if (config.teammatesEnabled && allIds.length > 0) {
      const changes: TeammateChange[] = [];
      for (let i = 0; i < config.teammateBatchSize; i++) {
        const id = allIds[Math.floor(Math.random() * allIds.length)];
        changes.push(randomTeammateChangeFor(id));
      }
      onChange(changes);
    }
    timer = setTimeout(tick, config.teammateIntervalMs);
  }

  timer = setTimeout(tick, config.teammateIntervalMs);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

export function nextStage(stage: Stage): Stage | null {
  const idx = STAGES.indexOf(stage);
  if (idx < 0 || idx >= STAGES.length - 2) return null; // Won/Lost are terminal
  return STAGES[idx + 1];
}
