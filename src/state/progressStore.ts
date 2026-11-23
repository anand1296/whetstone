/**
 * The app's progress store plus the only functions that change it.
 * Components call `progressActions.*`; they never build state themselves.
 */
import { createStore } from './createStore.ts';
import type { ReviewGrade } from '../lib/srs.ts';
import {
  deletePlan,
  EMPTY_PROGRESS,
  mergePlans,
  mergeProgress,
  progressEquals,
  recordReview,
  recordVisit,
  savePlan,
  setDone,
  setNotes,
  type ProgressState,
} from './progress.ts';
import { loadProgress, onOtherTabWrite, PROGRESS_KEY, readJson, removeKey, saveProgress, writeJson } from './persistence/local.ts';
import { flushServerSync, startCloudSync, startServerSync } from './persistence/cloudSync.ts';
import { computeSummary } from './summary.ts';
import { getContent } from '../content/index.ts';

export const progressStore = createStore<ProgressState>(EMPTY_PROGRESS);

const now = (): number => Date.now();

export const progressActions = {
  setDone(id: string, done: boolean): void {
    progressStore.setState((s) => setDone(s, id, done, now()));
  },
  review(id: string, grade: ReviewGrade): void {
    progressStore.setState((s) => recordReview(s, id, grade, now()));
  },
  saveNotes(id: string, notes: string): void {
    progressStore.setState((s) => setNotes(s, id, notes, now()));
  },
  visit(sectionId: string, questionId: string | null): void {
    progressStore.setState((s) => recordVisit(s, sectionId, questionId, now()));
  },
  importProgress(incoming: ProgressState, mode: 'merge' | 'replace'): void {
    // Replacing swaps the question progress; plans are merged so an old export without plans cannot wipe them.
    progressStore.setState((s) => (mode === 'merge' ? mergeProgress(s, incoming) : { ...incoming, plans: mergePlans(s.plans, incoming.plans) }));
  },
  /** Creates or updates a plan. Returns false when it was rejected (empty name, too many plans). */
  savePlan(plan: { id: string; name: string; facets: readonly string[] }): boolean {
    progressStore.setState((s) => savePlan(s, plan, now()));
    return progressStore.getState().plans[plan.id]?.deleted === false;
  },
  deletePlan(id: string): void {
    progressStore.setState((s) => deletePlan(s, id, now()));
  },
  /**
   * Reset keeps question entries as "not done" tombstones with a fresh clock
   * instead of deleting them, so the reset wins when merged with other devices.
   * Plans are choices, not progress, so they survive a reset.
   */
  reset(): void {
    progressStore.setState((s) => {
      const t = now();
      const questions: ProgressState['questions'] = {};
      for (const id of Object.keys(s.questions)) {
        questions[id] = { done: false, doneAt: null, stage: 0, dueAt: null, notes: '', updatedAt: t };
      }
      return { version: 1, questions, plans: s.plans, lastVisit: null };
    });
  },
};

let initialized = false;

/** Which signed-in account (server mode) this browser's local copy belongs to. */
const OWNER_KEY = 'whetstone:progress-owner';

export interface ProgressBoot {
  /** Server mode: the signed-in user's id, or null when signed out. Omit for local/Artifact mode. */
  serverUserId?: number | null;
}

/**
 * Boot persistence once: hydrate, save on change, follow other tabs, then sync.
 *
 * Server mode adopts anonymous local progress into the account on first
 * sign-in, but never mixes two accounts: if this browser's copy belongs to
 * someone else, it starts from that account's server copy instead.
 */
export function initProgress(boot: ProgressBoot = {}): void {
  if (initialized) return;
  initialized = true;
  const serverMode = boot.serverUserId !== undefined;
  if (serverMode && boot.serverUserId !== null) {
    const owner = readJson(OWNER_KEY);
    if (typeof owner === 'number' && owner !== boot.serverUserId) removeKey(PROGRESS_KEY);
    writeJson(OWNER_KEY, boot.serverUserId);
  }
  progressStore.setState(() => loadProgress());
  progressStore.subscribe(() => saveProgress(progressStore.getState()));
  onOtherTabWrite((incoming) => {
    progressStore.setState((s) => {
      const merged = mergeProgress(s, incoming);
      return progressEquals(merged, s) ? s : merged;
    });
  });
  if (serverMode) {
    if (boot.serverUserId !== null) startServerSync(progressStore);
  } else {
    void startCloudSync(progressStore, (state) => computeSummary(getContent().sections, state));
  }
}

/** Sign-out hygiene on shared computers: save, then forget this account's local copy. */
export async function forgetLocalProgress(): Promise<void> {
  await flushServerSync(progressStore);
  removeKey(PROGRESS_KEY);
  removeKey(OWNER_KEY);
}
