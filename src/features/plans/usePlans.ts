import { useEffect, useMemo, useState } from 'react';
import { useContent } from '../../content/index.ts';
import { effectiveFacets, LEGACY_PLAN_ID, pickActivePlan, planSections, suggestPlanName } from '../../state/plans.ts';
import { syncStatusStore } from '../../state/persistence/cloudSync.ts';
import { livePlans, type Plan } from '../../state/progress.ts';
import { prefsStore, updatePrefs } from '../../state/prefs.ts';
import { progressActions, progressStore } from '../../state/progressStore.ts';
import { useStore } from '../../state/useStore.ts';
import type { SectionMeta } from '../../content/types.ts';

/** The learner's live plans, oldest first. */
export function usePlans(): Plan[] {
  const plans = useStore(progressStore, (s) => s.plans);
  return useMemo(() => livePlans({ plans }), [plans]);
}

/**
 * The plan this device is working in, and its topics. With no plans yet (first run, or a
 * deep link before onboarding) `plan` is null and `sections` is every topic, so nothing
 * on screen is ever empty just because a plan is missing.
 */
export function useActivePlan(): { plan: Plan | null; sections: SectionMeta[] } {
  const { sections } = useContent();
  const plans = useStore(progressStore, (s) => s.plans);
  const activePlanId = useStore(prefsStore, (p) => p.activePlanId);
  return useMemo(() => {
    const plan = pickActivePlan({ plans }, activePlanId);
    return { plan, sections: plan ? planSections(sections, plan) : sections };
  }, [plans, activePlanId, sections]);
}

const SETTLE_TIMEOUT_MS = 4000;

/**
 * True once the first sync with the server (or the claude.ai document) has answered, or has
 * been silent for a few seconds (offline). Until then an empty plan list may just mean the
 * plans have not arrived yet, so first-run onboarding must wait rather than flash.
 */
export function useSyncSettled(): boolean {
  const status = useStore(syncStatusStore, (s) => s);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), SETTLE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return status !== 'connecting' || timedOut;
}

/**
 * People who used the app before plans existed keep what they had: their old topic
 * filter (or "everything", if they have progress) becomes their first plan. The seed
 * exists only while the document has no plans at all, not even deleted ones, so it never
 * brings back a plan someone removed, and the fixed id means two devices that both
 * migrate agree on one plan.
 */
export function useLegacyPlanSeed(): string[] | null {
  const { sections } = useContent();
  const settled = useSyncSettled();
  const hasPlanEntries = useStore(progressStore, (s) => Object.keys(s.plans).length > 0);
  const hasProgress = useStore(progressStore, (s) => Object.values(s.questions).some((q) => q.done || q.notes !== ''));
  const legacyFacets = useStore(prefsStore, (p) => p.facets);
  return useMemo(() => {
    if (!settled || hasPlanEntries || sections.length === 0) return null;
    const facets = effectiveFacets(sections, legacyFacets);
    if (facets.length === 0 && !hasProgress) return null; // a new person: onboarding asks instead
    return facets;
  }, [settled, hasPlanEntries, hasProgress, legacyFacets, sections]);
}

/** Creates that first plan. Mounted once, in the app shell. */
export function usePlanMigration(): void {
  const seed = useLegacyPlanSeed();
  useEffect(() => {
    if (seed === null) return;
    if (progressActions.savePlan({ id: LEGACY_PLAN_ID, name: suggestPlanName(seed), facets: seed })) {
      updatePrefs({ facets: [], activePlanId: LEGACY_PLAN_ID });
    }
  }, [seed]);
}
