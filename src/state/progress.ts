/**
 * The progress domain model: pure, immutable, framework-free.
 *
 * Every function takes the previous state and returns the next one (or the
 * same object when nothing changed, so subscribers can bail out cheaply).
 * `now` is always passed in, which keeps these functions deterministic and
 * trivially testable.
 */
import { nextDueAt, stageAfter, type ReviewGrade } from '../lib/srs.ts';

export interface QuestionProgress {
  done: boolean;
  doneAt: number | null;
  /** Index into the review ladder (see lib/srs.ts). */
  stage: number;
  /** When this answer is due for a refresher; null when not done. */
  dueAt: number | null;
  /** The learner's own words. Capped to keep the synced document small. */
  notes: string;
  /** Last-write-wins clock used when merging devices/tabs. */
  updatedAt: number;
}

export interface LastVisit {
  sectionId: string;
  questionId: string | null;
  at: number;
}

/**
 * A plan: a named set of topics someone is working through ("Frontend + Design",
 * "Go + Kubernetes"). It stores the *selection* (facet ids), not topic ids, so a
 * topic published later that matches the selection joins the plan by itself.
 * Progress stays per question and is shared: a question done in one plan counts
 * in every plan that contains it. Deleting a plan keeps a tombstone so the
 * delete wins when merged with another device.
 */
export interface Plan {
  id: string;
  name: string;
  facets: string[];
  createdAt: number;
  /** Last-write-wins clock, like the per-question one. */
  updatedAt: number;
  deleted: boolean;
}

export interface ProgressState {
  version: 1;
  questions: Record<string, QuestionProgress>;
  plans: Record<string, Plan>;
  lastVisit: LastVisit | null;
}

export const NOTES_LIMIT = 2000;
export const PLAN_NAME_LIMIT = 60;
/** Facet ids per plan; generous (there are about 40 facets in total). */
export const PLAN_FACETS_LIMIT = 20;
/** Live plans a person can have, and entries (including tombstones) kept in the document. */
export const MAX_LIVE_PLANS = 12;
export const MAX_PLAN_ENTRIES = 40;

export const EMPTY_PROGRESS: ProgressState = { version: 1, questions: {}, plans: {}, lastVisit: null };


function blank(): QuestionProgress {
  return { done: false, doneAt: null, stage: 0, dueAt: null, notes: '', updatedAt: 0 };
}

function patch(state: ProgressState, id: string, change: Partial<QuestionProgress>, now: number): ProgressState {
  const previous = state.questions[id] ?? blank();
  return {
    ...state,
    questions: { ...state.questions, [id]: { ...previous, ...change, updatedAt: now } },
  };
}

export function getQuestion(state: ProgressState, id: string): QuestionProgress {
  return state.questions[id] ?? blank();
}

export function setDone(state: ProgressState, id: string, done: boolean, now: number): ProgressState {
  if (getQuestion(state, id).done === done) return state;
  return done
    ? patch(state, id, { done: true, doneAt: now, stage: 0, dueAt: nextDueAt(0, now) }, now)
    : patch(state, id, { done: false, doneAt: null, stage: 0, dueAt: null }, now);
}

export function recordReview(state: ProgressState, id: string, grade: ReviewGrade, now: number): ProgressState {
  const current = state.questions[id];
  if (!current?.done) return state;
  const stage = stageAfter(current.stage, grade);
  if (stage === null) return setDone(state, id, false, now);
  return patch(state, id, { stage, dueAt: nextDueAt(stage, now) }, now);
}

export function setNotes(state: ProgressState, id: string, notes: string, now: number): ProgressState {
  const clipped = notes.slice(0, NOTES_LIMIT);
  if (getQuestion(state, id).notes === clipped) return state;
  return patch(state, id, { notes: clipped }, now);
}

export function recordVisit(state: ProgressState, sectionId: string, questionId: string | null, now: number): ProgressState {
  const last = state.lastVisit;
  if (last && last.sectionId === sectionId && last.questionId === questionId) return state;
  return { ...state, lastVisit: { sectionId, questionId, at: now } };
}

/* ---------- Plans ---------- */

export function cleanPlanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, PLAN_NAME_LIMIT);
}

function cleanFacets(facets: readonly string[]): string[] {
  return [...new Set(facets.filter((f) => typeof f === 'string' && f.length > 0 && f.length <= 40))].slice(0, PLAN_FACETS_LIMIT);
}

/** Tombstones older than the newest ones are dropped once the document would exceed MAX_PLAN_ENTRIES. */
function pruneTombstones(plans: Record<string, Plan>): Record<string, Plan> {
  const entries = Object.values(plans);
  if (entries.length < MAX_PLAN_ENTRIES) return plans;
  const dead = entries.filter((p) => p.deleted).sort((a, b) => a.updatedAt - b.updatedAt);
  const drop = new Set(dead.slice(0, entries.length - MAX_PLAN_ENTRIES + 1).map((p) => p.id));
  return Object.fromEntries(Object.entries(plans).filter(([id]) => !drop.has(id)));
}

export function livePlans(state: Pick<ProgressState, 'plans'>): Plan[] {
  return Object.values(state.plans)
    .filter((plan) => !plan.deleted)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/** Adds a plan (or replaces the one with this id). Returns the same state when the plan is invalid or the limit is reached. */
export function savePlan(state: ProgressState, plan: { id: string; name: string; facets: readonly string[] }, now: number): ProgressState {
  const name = cleanPlanName(plan.name);
  if (!plan.id || plan.id.length > 120 || name === '') return state;
  const existing = state.plans[plan.id];
  if (!existing || existing.deleted) {
    if (livePlans(state).length >= MAX_LIVE_PLANS) return state;
  }
  const facets = cleanFacets(plan.facets);
  if (existing && !existing.deleted && existing.name === name && existing.facets.join() === facets.join()) return state;
  const next: Plan = { id: plan.id, name, facets, createdAt: existing?.createdAt ?? now, updatedAt: now, deleted: false };
  return { ...state, plans: { ...pruneTombstones(state.plans), [plan.id]: next } };
}

export function deletePlan(state: ProgressState, id: string, now: number): ProgressState {
  const existing = state.plans[id];
  if (!existing || existing.deleted) return state;
  return { ...state, plans: { ...state.plans, [id]: { ...existing, name: '', facets: [], updatedAt: now, deleted: true } } };
}

export function mergePlans(a: Record<string, Plan>, b: Record<string, Plan>): Record<string, Plan> {
  const plans: Record<string, Plan> = { ...a };
  for (const [id, incoming] of Object.entries(b)) {
    const existing = plans[id];
    if (!existing || incoming.updatedAt > existing.updatedAt) plans[id] = incoming;
  }
  return plans;
}

export function isDue(progress: QuestionProgress | undefined, now: number): boolean {
  return Boolean(progress?.done && progress.dueAt !== null && progress.dueAt <= now);
}

/**
 * Merge two replicas (two tabs, or this device and the cloud copy).
 * Per question, the entry with the newest `updatedAt` wins; ties keep `a`.
 * This is a last-writer-wins map: a simple CRDT that converges as long as
 * clocks are roughly right, which is good enough for one person's progress.
 */
export function mergeProgress(a: ProgressState, b: ProgressState): ProgressState {
  const questions: Record<string, QuestionProgress> = { ...a.questions };
  for (const [id, incoming] of Object.entries(b.questions)) {
    const existing = questions[id];
    if (!existing || incoming.updatedAt > existing.updatedAt) questions[id] = incoming;
  }
  let lastVisit = a.lastVisit;
  if (b.lastVisit && (!lastVisit || b.lastVisit.at > lastVisit.at)) lastVisit = b.lastVisit;
  return { version: 1, questions, plans: mergePlans(a.plans, b.plans), lastVisit };
}

function sameQuestion(a: QuestionProgress, b: QuestionProgress): boolean {
  return (
    a.done === b.done &&
    a.doneAt === b.doneAt &&
    a.stage === b.stage &&
    a.dueAt === b.dueAt &&
    a.notes === b.notes &&
    a.updatedAt === b.updatedAt
  );
}

function samePlan(a: Plan, b: Plan): boolean {
  return (
    a.name === b.name &&
    a.deleted === b.deleted &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt &&
    a.facets.length === b.facets.length &&
    a.facets.every((facet, index) => facet === b.facets[index])
  );
}

export function progressEquals(a: ProgressState, b: ProgressState): boolean {
  if (a === b) return true;
  const planKeys = Object.keys(a.plans);
  if (planKeys.length !== Object.keys(b.plans).length) return false;
  for (const key of planKeys) {
    const left = a.plans[key];
    const right = b.plans[key];
    if (!left || !right || !samePlan(left, right)) return false;
  }
  const aKeys = Object.keys(a.questions);
  if (aKeys.length !== Object.keys(b.questions).length) return false;
  for (const key of aKeys) {
    const left = a.questions[key];
    const right = b.questions[key];
    if (!left || !right || !sameQuestion(left, right)) return false;
  }
  const la = a.lastVisit;
  const lb = b.lastVisit;
  if (la === null || lb === null) return la === lb;
  return la.sectionId === lb.sectionId && la.questionId === lb.questionId && la.at === lb.at;
}

/* ---------- Parsing untrusted input (localStorage, imports, cloud) ---------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseQuestion(value: unknown): QuestionProgress | null {
  if (!isRecord(value)) return null;
  const { done, doneAt, stage, dueAt, notes, updatedAt } = value;
  if (typeof done !== 'boolean' || typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) return null;
  return {
    done,
    doneAt: finiteOrNull(doneAt),
    stage: typeof stage === 'number' && stage >= 0 ? Math.floor(stage) : 0,
    dueAt: finiteOrNull(dueAt),
    notes: typeof notes === 'string' ? notes.slice(0, NOTES_LIMIT) : '',
    updatedAt,
  };
}

function parsePlan(id: string, value: unknown): Plan | null {
  if (!isRecord(value) || id === '' || id.length > 120) return null;
  const { name, facets, createdAt, updatedAt, deleted } = value;
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) return null;
  const isDeleted = deleted === true;
  const cleanName = typeof name === 'string' ? cleanPlanName(name) : '';
  if (!isDeleted && cleanName === '') return null;
  return {
    id,
    name: isDeleted ? '' : cleanName,
    facets: isDeleted || !Array.isArray(facets) ? [] : cleanFacets(facets.filter((f): f is string => typeof f === 'string')),
    createdAt: typeof createdAt === 'number' && Number.isFinite(createdAt) ? createdAt : updatedAt,
    updatedAt,
    deleted: isDeleted,
  };
}

function parseLastVisit(value: unknown): LastVisit | null {
  if (!isRecord(value)) return null;
  const { sectionId, questionId, at } = value;
  if (typeof sectionId !== 'string' || typeof at !== 'number') return null;
  return { sectionId, questionId: typeof questionId === 'string' ? questionId : null, at };
}

/** Validate anything that claims to be progress. Invalid entries are dropped, not trusted. */
export function parseProgress(input: unknown): ProgressState | null {
  if (!isRecord(input) || input.version !== 1 || !isRecord(input.questions)) return null;
  const questions: Record<string, QuestionProgress> = {};
  for (const [id, value] of Object.entries(input.questions)) {
    const parsed = parseQuestion(value);
    if (parsed) questions[id] = parsed;
  }
  const plans: Record<string, Plan> = {};
  if (isRecord(input.plans)) {
    for (const [id, value] of Object.entries(input.plans)) {
      const parsed = parsePlan(id, value);
      if (parsed && Object.keys(plans).length < MAX_PLAN_ENTRIES) plans[id] = parsed;
    }
  }
  return { version: 1, questions, plans, lastVisit: parseLastVisit(input.lastVisit) };
}

/** A plain object view for storage APIs that expect `Record<string, unknown>`. */
export function toDocument(state: ProgressState): Record<string, unknown> {
  return { version: state.version, questions: state.questions, plans: state.plans, lastVisit: state.lastVisit };
}
