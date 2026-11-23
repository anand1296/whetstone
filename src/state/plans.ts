/**
 * Plans, resolved against content. Pure functions of (plans, sections), like selectors.ts.
 *
 * A plan stores a facet selection; this module turns it into topics. Resolving at read
 * time (rather than storing topic ids) means a plan keeps working when content changes:
 * a new Kubernetes topic joins "Go + Kubernetes" by itself and a hidden one drops out.
 */
import { describeSelection, filterSections, normalizeSelection } from '../content/facets.ts';
import type { QuestionMeta, SectionMeta } from '../content/types.ts';
import { isDue, livePlans, type Plan, type ProgressState, type QuestionProgress } from './progress.ts';

type ProgressMap = Record<string, QuestionProgress>;

/** The deterministic id for the plan made from pre-plans preferences, so two devices that both migrate make one plan, not two. */
export const LEGACY_PLAN_ID = 'plan-first';

/** Facets a plan still means: unknown or content-less ones (a topic was hidden) are ignored, like the old overview filter did. */
export function effectiveFacets(sections: readonly SectionMeta[], facets: readonly string[]): string[] {
  return normalizeSelection(sections, facets.filter((id) => sections.some((section) => section.facets.includes(id))));
}

export function planSections<T extends SectionMeta>(sections: readonly T[], plan: Pick<Plan, 'facets'>): T[] {
  return filterSections(sections, effectiveFacets(sections, plan.facets));
}

/** A readable default name for a selection: "Frontend + Design", "Backend · Go, Kubernetes", or "Everything". */
export function suggestPlanName(facets: readonly string[]): string {
  return facets.length === 0 ? 'Everything' : describeSelection(facets);
}

/** The plan this device is working in: the remembered one if it still exists, else the oldest. */
export function pickActivePlan(state: Pick<ProgressState, 'plans'>, activePlanId: string | null): Plan | null {
  const plans = livePlans(state);
  return plans.find((plan) => plan.id === activePlanId) ?? plans[0] ?? null;
}

export function newPlanId(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `plan-${random}`;
}

export interface PlanStats {
  sections: SectionMeta[];
  questions: QuestionMeta[];
  done: number;
  due: number;
  minutes: number;
  /** Minutes of study left: the questions not done yet. */
  minutesLeft: number;
}

/** Everything a plan card or page shows, in one pass. Pure, so it is cheap to memoize and easy to test. */
export function planStats(sections: readonly SectionMeta[], plan: Pick<Plan, 'facets'>, progress: ProgressMap, now: number): PlanStats {
  const mine = planSections(sections, plan);
  const questions = mine.flatMap((section) => section.questions);
  let done = 0;
  let due = 0;
  let minutes = 0;
  let minutesLeft = 0;
  for (const question of questions) {
    minutes += question.minutes;
    const entry = progress[question.id];
    if (entry?.done) done += 1;
    else minutesLeft += question.minutes;
    if (isDue(entry, now)) due += 1;
  }
  return { sections: mine, questions, done, due, minutes, minutesLeft };
}
